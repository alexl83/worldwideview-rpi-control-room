import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function unwrapContent(content) {
  let current = content;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current.audioMessage) return current;
    current = current.ephemeralMessage?.message
      ?? current.viewOnceMessage?.message
      ?? current.viewOnceMessageV2?.message
      ?? current.documentWithCaptionMessage?.message
      ?? current.editedMessage?.message
      ?? current.associatedChildMessage?.message;
  }
  return null;
}

export function audioMessage(message) {
  return unwrapContent(message?.message)?.audioMessage ?? null;
}

export function speechText(text, maxChars = 4_000) {
  const normalized = String(text ?? "")
    .replace(/```[\s\S]*?```/g, " Blocco di codice disponibile nella risposta testuale. ")
    .replace(/https?:\/\/\S+/g, " link disponibile nella risposta testuale ")
    .replace(/[*_#>`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}. La risposta completa è disponibile nel messaggio testuale.`;
}

function run(command, args, { input, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(command)} non ha concluso entro ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim().slice(-2_000) || `${path.basename(command)} terminato con codice ${code}`));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

export class VoiceRuntime {
  constructor({ logger, whisperPath, whisperModel, piperPython, piperModel,
    ffmpegPath = "/usr/bin/ffmpeg", maxInputBytes = 12 * 1024 * 1024,
    maxDurationSeconds = 180, maxSpeechChars = 4_000 }) {
    this.logger = logger;
    this.whisperPath = whisperPath;
    this.whisperModel = whisperModel;
    this.piperPython = piperPython;
    this.piperModel = piperModel;
    this.ffmpegPath = ffmpegPath;
    this.maxInputBytes = maxInputBytes;
    this.maxDurationSeconds = maxDurationSeconds;
    this.maxSpeechChars = maxSpeechChars;
  }

  validate() {
    for (const [name, file] of Object.entries({
      whisper: this.whisperPath,
      whisperModel: this.whisperModel,
      piperPython: this.piperPython,
      piperModel: this.piperModel,
      ffmpeg: this.ffmpegPath,
    })) {
      if (!file || !fs.existsSync(file)) throw new Error(`Componente voce mancante (${name}): ${file || "non configurato"}`);
    }
  }

  async transcribe(message, sock) {
    const metadata = audioMessage(message);
    if (!metadata) throw new Error("Il messaggio non contiene audio supportato");
    const seconds = Number(metadata.seconds ?? 0);
    if (seconds > this.maxDurationSeconds) {
      throw new Error(`Nota vocale troppo lunga: massimo ${this.maxDurationSeconds} secondi`);
    }
    const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
    const media = await downloadMediaMessage(message, "buffer", {}, {
      logger: this.logger,
      reuploadRequest: sock.updateMediaMessage,
    });
    if (!Buffer.isBuffer(media) || media.length === 0) throw new Error("Audio WhatsApp vuoto o non scaricabile");
    if (media.length > this.maxInputBytes) throw new Error(`Nota vocale troppo grande: massimo ${Math.floor(this.maxInputBytes / 1024 / 1024)} MB`);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwv-stt-"));
    const inputPath = path.join(dir, "input.media");
    const wavPath = path.join(dir, "input.wav");
    const outputBase = path.join(dir, "transcript");
    try {
      fs.writeFileSync(inputPath, media, { mode: 0o600 });
      await run(this.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath,
      ], { timeoutMs: 120_000 });
      await run(this.whisperPath, [
        "-m", this.whisperModel, "-f", wavPath, "-l", "it", "-t", "4",
        "-nt", "-np", "-otxt", "-of", outputBase,
      ]);
      const transcript = fs.readFileSync(`${outputBase}.txt`, "utf8").replace(/\s+/g, " ").trim();
      if (!transcript) throw new Error("Non ho rilevato una frase comprensibile");
      return transcript;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  async synthesize(text) {
    const spoken = speechText(text, this.maxSpeechChars);
    if (!spoken) throw new Error("La risposta non contiene testo sintetizzabile");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwv-tts-"));
    const wavPath = path.join(dir, "response.wav");
    const opusPath = path.join(dir, "response.ogg");
    try {
      await run(this.piperPython, [
        "-m", "piper", "-m", this.piperModel, "-f", wavPath, "--", spoken,
      ], { timeoutMs: 180_000 });
      await run(this.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-y", "-i", wavPath,
        "-c:a", "libopus", "-b:a", "32k", "-application", "voip", opusPath,
      ], { timeoutMs: 120_000 });
      return fs.readFileSync(opusPath);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
