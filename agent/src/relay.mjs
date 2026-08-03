import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import NodeCache from "node-cache";
import pino from "pino";
import QRCode from "qrcode";
import qrcode from "qrcode-terminal";
import { MonitorRuntime } from "./monitor.mjs";
import { findOutboundEntry, outboundKey } from "./outbound-cache.mjs";
import { VoiceRuntime, audioMessage } from "./voice.mjs";

const mode = process.argv[2] ?? "run";
const stateDir = process.env.WWV_AGENT_STATE_DIR ?? "/var/lib/wwv-agent";
const authDir = path.join(stateDir, "whatsapp-auth");
const sessionsFile = path.join(stateDir, "sessions.json");
const outboundMessagesFile = path.join(stateDir, "whatsapp-outbound-messages.json");
const resendRequestFile = path.join(stateDir, "whatsapp-resend-request.json");
const monitorsFile = process.env.WWV_AGENT_MONITORS_FILE ?? "/etc/wwv-monitors.json";
const monitorStateFile = path.join(stateDir, "monitor-state.json");
const engineUrl = process.env.WWV_AGENT_ENGINE_URL ?? "http://127.0.0.1:5000";
const frontendSocket = process.env.WWV_AGENT_FRONTEND_SOCKET ?? "/run/wwv-agent/chat.sock";
const frontendToken = process.env.WWV_AGENT_SOCKET_TOKEN ?? "";
const headlessSessionId = process.env.WWV_AGENT_HEADLESS_SESSION_ID ?? "";
const workspace = process.env.WWV_AGENT_WORKSPACE ?? "/srv/worldwideview";
const maxChars = Number(process.env.WWV_AGENT_MAX_MESSAGE_CHARS ?? 12000);
const timeoutMs = Number(process.env.WWV_AGENT_TIMEOUT_MS ?? 600000);
const model = process.env.WWV_AGENT_MODEL?.trim();
const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const voiceRuntime = new VoiceRuntime({
  logger,
  whisperPath: process.env.WWV_AGENT_WHISPER_PATH ?? "/opt/wwv-voice/whisper/whisper-cli",
  whisperModel: process.env.WWV_AGENT_WHISPER_MODEL ?? "/opt/wwv-voice/models/ggml-base.bin",
  piperPython: process.env.WWV_AGENT_PIPER_PYTHON ?? "/opt/wwv-voice/piper/bin/python3",
  piperModel: process.env.WWV_AGENT_PIPER_MODEL ?? "/opt/wwv-voice/models/it_IT-paola-medium.onnx",
  ffmpegPath: process.env.WWV_AGENT_FFMPEG_PATH ?? "/usr/bin/ffmpeg",
  maxInputBytes: Number(process.env.WWV_AGENT_VOICE_MAX_BYTES ?? 12 * 1024 * 1024),
  maxDurationSeconds: Number(process.env.WWV_AGENT_VOICE_MAX_SECONDS ?? 180),
  maxSpeechChars: Number(process.env.WWV_AGENT_VOICE_MAX_SPEECH_CHARS ?? 4000),
});
const allowed = new Set(
  (process.env.WWV_AGENT_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map(normalizeNumber)
    .filter(Boolean),
);
const active = new Set();
let monitorRuntime;
let monitorTimer;
let reconnectTimer;
let socketGeneration = 0;
const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, useClones: false });

function normalizeNumber(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function loadSessions() {
  try {
    return JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const tmp = `${sessionsFile}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(sessions, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, sessionsFile);
}

function loadOutboundMessages() {
  try {
    const parsed = JSON.parse(fs.readFileSync(outboundMessagesFile, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let outboundMessages = loadOutboundMessages();

function saveOutboundMessages() {
  const now = Date.now();
  const retentionMs = 7 * 24 * 3600_000;
  const retained = Object.entries(outboundMessages)
    .filter(([, entry]) => now - Number(entry?.savedAt ?? 0) < retentionMs)
    .sort(([, a], [, b]) => Number(b.savedAt) - Number(a.savedAt))
    .slice(0, 1000);
  outboundMessages = Object.fromEntries(retained);
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const temporary = `${outboundMessagesFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(outboundMessages)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, outboundMessagesFile);
}

function rememberOutboundMessage(sent) {
  const key = outboundKey(sent?.key);
  if (!key || !sent?.message) return;
  outboundMessages[key] = {
    savedAt: Date.now(),
    messageId: sent.key.id,
    remoteJid: sent.key.remoteJid,
    protobuf: Buffer.from(proto.Message.encode(sent.message).finish()).toString("base64"),
  };
  saveOutboundMessages();
}

async function getOutboundMessage(key) {
  const entry = findOutboundEntry(outboundMessages, key);
  if (!entry?.protobuf) {
    logger.warn({ messageId: key?.id, remoteJid: key?.remoteJid }, "WhatsApp retry requested for uncached message");
    return undefined;
  }
  logger.info({ messageId: key.id, remoteJid: key.remoteJid }, "serving cached WhatsApp message retry");
  return proto.Message.decode(Buffer.from(entry.protobuf, "base64"));
}

async function processResendRequest(sock) {
  if (!fs.existsSync(resendRequestFile)) return;
  const request = JSON.parse(fs.readFileSync(resendRequestFile, "utf8"));
  const messageId = String(request?.messageId ?? "").trim();
  if (!messageId) throw new Error("WhatsApp resend request has no messageId");
  const entry = findOutboundEntry(outboundMessages, { id: messageId });
  const suffix = `:${messageId}`;
  const legacyKey = Object.keys(outboundMessages).find((key) => key.endsWith(suffix));
  const remoteJid = entry?.remoteJid ?? legacyKey?.slice(0, -suffix.length);
  if (!entry?.protobuf || !remoteJid) throw new Error(`cached WhatsApp message ${messageId} not found`);
  const message = proto.Message.decode(Buffer.from(entry.protobuf, "base64"));
  const text = message.conversation
    ?? message.extendedTextMessage?.text
    ?? message.imageMessage?.caption
    ?? message.videoMessage?.caption;
  if (!text) throw new Error(`cached WhatsApp message ${messageId} is not text-resendable`);
  const sent = await sock.sendMessage(remoteJid, { text });
  fs.unlinkSync(resendRequestFile);
  logger.info({ originalMessageId: messageId, newMessageId: sent?.key?.id }, "resent cached WhatsApp message");
}

function messageText(message) {
  const content = message?.message;
  if (!content) return "";
  return (
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    ""
  ).trim();
}

function splitText(text) {
  const result = [];
  let rest = text.trim();
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("\n", maxChars);
    if (cut < maxChars / 2) cut = maxChars;
    result.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) result.push(rest);
  return result.length ? result : ["Nessuna risposta prodotta."];
}

function codexArgs(threadId, prompt, { sessionId } = {}) {
  const common = ["--json", "--skip-git-repo-check"];
  if (model) common.push("--model", model);
  if (sessionId) {
    const url = sessionId === headlessSessionId
      ? "http://127.0.0.1:3080/mcp/headless"
      : `http://127.0.0.1:3000/api/mcp?sessionId=${encodeURIComponent(sessionId)}`;
    common.push("--config", `mcp_servers.worldwideview.url=${JSON.stringify(url)}`);
  }
  if (threadId) return ["exec", "resume", ...common, threadId, prompt];
  return [
    "exec",
    ...common,
    "--sandbox",
    "read-only",
    "--cd",
    workspace,
    prompt,
  ];
}

async function runCodex(threadId, prompt, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn("codex", codexArgs(threadId, prompt, options), {
      cwd: workspace,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";
    let stderr = "";
    let newThreadId = threadId;
    let finalText = "";
    const timer = setTimeout(() => {
      child.kill("SIGINT");
      reject(new Error(`Codex non ha concluso entro ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "thread.started") newThreadId = event.thread_id;
          if (event.type === "item.completed" && event.item?.type === "agent_message") {
            finalText = event.item.text ?? finalText;
          }
        } catch (error) {
          logger.warn({ error, line }, "invalid Codex JSONL event");
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ threadId: newThreadId, text: finalText });
      else reject(new Error(stderr.trim() || `Codex terminato con codice ${code}`));
    });
  });
}

function readRequestBody(request, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error("request too large"));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function handleFrontendChat(request, response) {
  if (request.method !== "POST" || request.url !== "/chat") {
    sendJson(response, 404, { error: "not found" });
    return;
  }
  if (!frontendToken || request.headers.authorization !== `Bearer ${frontendToken}`) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }
  try {
    const body = JSON.parse(await readRequestBody(request));
    const userId = String(body.userId ?? "");
    const sessionId = String(body.sessionId ?? "");
    const prompt = String(body.prompt ?? "").trim();
    if (!userId || !/^[0-9a-f-]{36}$/i.test(sessionId) || !prompt || prompt.length > 12_000) {
      sendJson(response, 400, { error: "invalid request" });
      return;
    }
    const key = `frontend:${userId}:${sessionId}`;
    const sessions = loadSessions();
    const pinnedPrompt = [
      `Richiesta proveniente dalla scheda WorldWideView ${sessionId}.`,
      "Questa conversazione è rigidamente vincolata a tale scheda dal server MCP.",
      "Non scegliere, interrogare o controllare altre sessioni, inclusa quella headless.",
      "Rispondi in italiano salvo diversa richiesta dell'utente.",
      "",
      prompt,
    ].join("\n");
    const result = await runCodex(sessions[key]?.threadId, pinnedPrompt, { sessionId });
    if (result.threadId) {
      sessions[key] = { threadId: result.threadId, updatedAt: new Date().toISOString() };
      saveSessions(sessions);
    }
    sendJson(response, 200, { text: result.text, threadId: result.threadId });
  } catch (error) {
    logger.error({ error }, "frontend chat failed");
    sendJson(response, 500, { error: error.message });
  }
}

function startFrontendServer() {
  if (!frontendToken) {
    logger.warn("WWV_AGENT_SOCKET_TOKEN is empty; frontend chat disabled");
    return;
  }
  fs.mkdirSync(path.dirname(frontendSocket), { recursive: true, mode: 0o755 });
  try {
    const stat = fs.lstatSync(frontendSocket);
    if (stat.isSocket()) fs.unlinkSync(frontendSocket);
    else throw new Error(`${frontendSocket} exists and is not a socket`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const server = http.createServer((request, response) => {
    handleFrontendChat(request, response).catch((error) => {
      logger.error({ error }, "frontend request handler failed");
      if (!response.headersSent) sendJson(response, 500, { error: "internal error" });
    });
  });
  server.listen(frontendSocket, () => {
    fs.chmodSync(frontendSocket, 0o666);
    logger.info({ frontendSocket }, "frontend chat socket listening");
  });
}

function monitorPrompt(monitor, result) {
  return `Sei l'analista di una control room OSINT personale. Produci un alert WhatsApp conciso in italiano.
Usa esclusivamente i dati JSON forniti: non aggiungere fatti, non fare altre query e non presentare assenza
nel feed come assenza reale. Includi: titolo con gravità, luogo e raggio, novità rilevanti ordinate per
importanza, distanza, fonte/link quando presente, stato dei feed, limiti e confidenza. Massimo 1200 caratteri.
Se fatalitiesMin e fatalitiesMax differiscono, presentali come intervallo dichiarato e non sommarli.
variantCount indica quanti record sono stati consolidati nello stesso evento.
Non assegnare gravità alta a record con verification diversa da "source_report". fatalitiesReported
è solo il valore non verificato ricevuto dal feed e non deve essere presentato come vittime reali.

Monitor:
${JSON.stringify({ id: monitor.id, name: monitor.name, center: monitor.center, radiusKm: monitor.radiusKm })}

Feed:
${JSON.stringify(result.feeds)}

Eventi da analizzare:
${JSON.stringify(result.triggered.slice(0, 20))}`;
}

async function analyzeMonitor(monitor, result) {
  try {
    const response = await runCodex(null, monitorPrompt(monitor, result));
    if (response.text?.trim()) return response.text.trim();
  } catch (error) {
    logger.error({ error, monitor: monitor.id }, "monitor analysis failed");
  }
  const first = result.triggered[0];
  return [
    `🚨 ${monitor.name ?? monitor.id}`,
    `${result.triggered.length} nuovi eventi entro ${monitor.radiusKm ?? 50} km.`,
    first ? `${first.type} — ${first.location ?? "posizione non nominata"}, ${first.distanceKm} km.` : "",
    "Analisi Codex non disponibile; verifica i feed prima di agire.",
  ].filter(Boolean).join("\n");
}

async function notifyMonitor(sock, monitor, text) {
  const configured = monitor.notification?.recipients;
  const recipients = Array.isArray(configured) && configured.length
    ? configured.map(normalizeNumber).filter((number) => allowed.has(number))
    : [...allowed].slice(0, 1);
  for (const number of recipients) {
    for (const chunk of splitText(text)) {
      await sock.sendMessage(`${number}@s.whatsapp.net`, { text: chunk });
    }
  }
}

function formatMonitorList() {
  const entries = monitorRuntime?.list() ?? [];
  if (!entries.length) return "Nessun monitor configurato.";
  return entries.map((item) => [
    `${item.enabled ? "🟢" : "⏸️"} ${item.id} — ${item.name}`,
    `ultimo controllo: ${item.lastRun ?? "mai"}; ultimo alert: ${item.lastAlert ?? "mai"}`,
  ].join("\n")).join("\n\n");
}

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith("@g.us") || msg.key.fromMe) return;
  // Recent WhatsApp accounts may use an opaque LID as remoteJid. Baileys
  // exposes the corresponding phone-number JID in one of the *Alt fields.
  const senderJid = msg.key.remoteJidAlt ?? msg.key.participantAlt ?? msg.key.participant ?? jid;
  const sender = normalizeNumber(senderJid.split("@")[0]);
  const remoteIdentity = normalizeNumber(jid.split("@")[0]);
  if (!allowed.has(sender) && !allowed.has(remoteIdentity)) {
    logger.warn({ sender, jid, senderJid }, "blocked WhatsApp sender");
    return;
  }
  const voice = Boolean(audioMessage(msg));
  let text = messageText(msg);
  if (!text && !voice) return;
  if (active.has(jid)) {
    await sock.sendMessage(jid, { text: "Sto già elaborando una richiesta. Riprova quando ho concluso." });
    return;
  }

  const sessions = loadSessions();
  // Slash commands are deliberately text-only: a voice note is always treated
  // as a natural-language Codex request, even if its transcript starts with "/".
  if (text === "/new") {
    delete sessions[jid];
    saveSessions(sessions);
    await sock.sendMessage(jid, { text: "Nuova sessione Codex pronta." });
    return;
  }
  if (text === "/status") {
    await sock.sendMessage(jid, {
      text: `Relay attivo. Sessione: ${sessions[jid]?.threadId ?? "nuova"}. Globo: headless ${headlessSessionId.slice(0, 8)}. Sandbox: read-only. Voce: attiva. Monitor: ${monitorRuntime?.list().filter((item) => item.enabled).length ?? 0} attivi.`,
    });
    return;
  }
  if (text === "/monitors") {
    await sock.sendMessage(jid, { text: formatMonitorList() });
    return;
  }
  const monitorToggle = text.match(/^\/monitor\s+(\S+)\s+(on|off|pause)$/i);
  if (monitorToggle) {
    const enabled = monitorToggle[2].toLowerCase() === "on";
    const changed = monitorRuntime?.setEnabled(monitorToggle[1], enabled);
    await sock.sendMessage(jid, {
      text: changed ? `Monitor ${monitorToggle[1]} ${enabled ? "attivato" : "sospeso"}.` : `Monitor ${monitorToggle[1]} non trovato.`,
    });
    return;
  }
  const brief = text.match(/^\/brief\s+(\S+)$/i);
  if (brief) {
    try {
      const result = await monitorRuntime.run(brief[1], { force: true, notify: false, persist: false });
      result.triggered = result.current;
      const monitor = monitorRuntime.config().monitors.find((item) => item.id === brief[1]);
      await sock.sendMessage(jid, { text: await analyzeMonitor(monitor, result) });
    } catch (error) {
      await sock.sendMessage(jid, { text: `Brief non disponibile: ${error.message}` });
    }
    return;
  }
  if (text === "/help") {
    await sock.sendMessage(jid, { text: "Comandi: /status, /new, /monitors, /monitor <id> on|off, /brief <id>, /help. Ogni altro messaggio viene inviato a Codex." });
    return;
  }

  active.add(jid);
  await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });
  try {
    if (voice) {
      text = await voiceRuntime.transcribe(msg, sock);
      logger.info({ jid, transcriptChars: text.length }, "WhatsApp voice note transcribed");
      await sock.sendMessage(jid, { text: `🎙️ Ho capito: “${text}”` });
    }
    const pinnedPrompt = [
      `Questa richiesta WhatsApp è rigidamente vincolata alla sessione WorldWideView headless ${headlessSessionId}.`,
      "Usa e controlla esclusivamente tale sessione. Non scegliere né manovrare sessioni browser interattive.",
      "Rispondi in italiano salvo diversa richiesta dell'utente.",
      "",
      text,
    ].join("\n");
    const result = await runCodex(sessions[jid]?.threadId, pinnedPrompt, { sessionId: headlessSessionId });
    if (result.threadId) {
      sessions[jid] = { threadId: result.threadId, updatedAt: new Date().toISOString() };
      saveSessions(sessions);
    }
    for (const chunk of splitText(result.text)) await sock.sendMessage(jid, { text: chunk });
    if (voice) {
      try {
        const audio = await voiceRuntime.synthesize(result.text);
        await sock.sendMessage(jid, {
          audio,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        });
      } catch (error) {
        // The full text has already been delivered, so a TTS failure never
        // suppresses or replaces the actual answer.
        logger.error({ error, jid }, "voice reply synthesis failed");
        await sock.sendMessage(jid, { text: `Risposta vocale non disponibile: ${error.message}` });
      }
    }
    await sock.sendMessage(jid, { react: { text: "✅", key: msg.key } });
  } catch (error) {
    logger.error({ error, jid }, "Codex turn failed");
    await sock.sendMessage(jid, { text: `Errore Codex: ${error.message}` });
    await sock.sendMessage(jid, { react: { text: "❌", key: msg.key } });
  } finally {
    active.delete(jid);
  }
}

async function connect() {
  const generation = ++socketGeneration;
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ component: "baileys" }),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    msgRetryCounterCache,
    maxMsgRetryCount: 5,
    getMessage: getOutboundMessage,
  });

  const sendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const sent = await sendMessage(...args);
    rememberOutboundMessage(sent);
    return sent;
  };

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const qrPath = path.join(stateDir, "whatsapp-pairing.png");
      await QRCode.toFile(qrPath, qr, {
        type: "png",
        width: 1024,
        margin: 4,
        errorCorrectionLevel: "M",
      });
      fs.chmodSync(qrPath, 0o600);
      logger.info({ qrPath }, "WhatsApp pairing PNG written");
      process.stdout.write("Scansiona il QR da WhatsApp > Dispositivi collegati:\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      logger.info("WhatsApp connected");
      processResendRequest(sock).catch((error) => logger.error({ error }, "cached WhatsApp resend failed"));
      if (!monitorRuntime) {
        try {
          fs.accessSync(monitorsFile, fs.constants.R_OK);
        } catch (error) {
          logger.warn({ error, monitorsFile }, "monitor configuration is not readable; monitoring disabled");
        }
        monitorRuntime = new MonitorRuntime({
          configFile: monitorsFile,
          stateFile: monitorStateFile,
          engineUrl,
          logger,
          analyze: analyzeMonitor,
          notify: (monitor, text) => notifyMonitor(sock, monitor, text),
        });
      } else {
        monitorRuntime.notify = (monitor, text) => notifyMonitor(sock, monitor, text);
      }
      if (!monitorTimer) {
        monitorRuntime.tick().catch((error) => logger.error({ error }, "initial monitor tick failed"));
        monitorTimer = setInterval(() => {
          monitorRuntime.tick().catch((error) => logger.error({ error }, "monitor tick failed"));
        }, 30_000);
      }
    }
    if (connection === "close") {
      if (generation !== socketGeneration) return;
      const status = lastDisconnect?.error?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        logger.error("WhatsApp logged out; run wwv-agent login again");
        process.exit(1);
      }
      logger.warn({ status }, "WhatsApp disconnected; reconnecting");
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          connect().catch((error) => logger.error({ error }, "reconnect failed"));
        }, 3000);
      }
    }
  });
  if (mode === "run") {
    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) handleMessage(sock, msg).catch((error) => logger.error({ error }, "message handler failed"));
    });
  }
}

if (mode === "status") {
  const authExists = fs.existsSync(path.join(authDir, "creds.json"));
  console.log(JSON.stringify({ authExists, allowedNumbers: allowed.size, workspace, sessions: Object.keys(loadSessions()).length }, null, 2));
  process.exit(authExists ? 0 : 1);
}

if (!fs.existsSync(workspace)) throw new Error(`Workspace inesistente: ${workspace}`);
if (mode === "run" && allowed.size === 0) throw new Error("WWV_AGENT_ALLOWED_NUMBERS è vuoto: avvio negato");
if (mode === "run" && !isUuid(headlessSessionId)) throw new Error("WWV_AGENT_HEADLESS_SESSION_ID deve essere un UUID valido");
if (mode === "run") voiceRuntime.validate();
if (mode === "run") startFrontendServer();
await connect();
