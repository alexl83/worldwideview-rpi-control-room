import crypto from "node:crypto";
import { readJson, writeJson } from "./monitor.mjs";

const DRAFT_TTL_MS = 10 * 60_000;
const LAYER_ALIASES = new Map([
  ["earthquake", "earthquakes"], ["earthquakes", "earthquakes"], ["terremoti", "earthquakes"],
  ["wildfire", "wildfire"], ["wildfires", "wildfire"], ["incendi", "wildfire"],
  ["civil-unrest", "civil-unrest"], ["civilunrest", "civil-unrest"], ["disordini", "civil-unrest"],
  ["conflict-events", "conflict-events"], ["conflicts", "conflict-events"], ["conflitti", "conflict-events"],
  ["military-aviation", "military-aviation"], ["military", "military-aviation"], ["aviazione", "military-aviation"],
  ["gps-jamming", "gps-jamming"], ["gps", "gps-jamming"],
  ["iranwarlive", "iranwarlive"],
]);

function slug(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function parseRadius(value) {
  const match = String(value).trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:km)?$/i);
  const radius = match ? Number(match[1].replace(",", ".")) : NaN;
  if (!Number.isFinite(radius) || radius < 1 || radius > 500) {
    throw new Error("Il raggio deve essere compreso tra 1 e 500 km");
  }
  return radius;
}

export function parseLayers(value) {
  const requested = String(value).toLowerCase().split(/[;,\s]+/).filter(Boolean);
  const layers = [...new Set(requested.map((item) => LAYER_ALIASES.get(item)))];
  if (!requested.length || layers.some((item) => !item)) {
    const invalid = requested.filter((item) => !LAYER_ALIASES.has(item));
    throw new Error(`Layer non riconosciuti: ${invalid.join(", ") || "nessuno"}`);
  }
  return layers;
}

export function parseInlineCreate(value) {
  const quoted = String(value).trim().match(/^"([^"]+)"\s+"([^"]+)"\s+(\S+)\s+(.+)$/);
  if (quoted) return { name: quoted[1], place: quoted[2], radiusKm: parseRadius(quoted[3]), layers: parseLayers(quoted[4]) };
  const fields = String(value).split("|").map((item) => item.trim());
  if (fields.length === 4 && fields.every(Boolean)) {
    return { name: fields[0], place: fields[1], radiusKm: parseRadius(fields[2]), layers: parseLayers(fields[3]) };
  }
  throw new Error('Usa: /monitor create "Nome" "Luogo" 10km earthquakes,wildfire');
}

function monitorFrom(spec, location) {
  const layers = spec.layers;
  return {
    id: slug(spec.name),
    name: spec.name,
    enabled: true,
    center: { lat: location.lat, lon: location.lon },
    centerLabel: location.label,
    radiusKm: spec.radiusKm,
    layers,
    intervalSeconds: 300,
    seenRetentionHours: 168,
    triggers: {
      newEvents: true,
      ...(layers.includes("earthquakes") ? { minimumMagnitude: 2.5 } : {}),
      ...(layers.includes("conflict-events") ? { minimumFatalities: 1 } : {}),
      ...(layers.includes("military-aviation") ? { aircraftEnteringArea: true } : {}),
    },
    notification: { cooldownMinutes: 30 },
  };
}

function formatMonitor(monitor, enabled = monitor.enabled !== false) {
  return [
    `${enabled ? "🟢" : "⏸️"} ${monitor.id} — ${monitor.name}`,
    `📍 ${monitor.centerLabel ?? `${monitor.center.lat}, ${monitor.center.lon}`}`,
    `Raggio: ${monitor.radiusKm} km`,
    `Layer: ${monitor.layers.join(", ")}`,
  ].join("\n");
}

async function geocode(place, endpoint) {
  const url = new URL(endpoint);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", place);
  const response = await fetch(url, {
    headers: { "User-Agent": "WorldWideView-Control-Room/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Geocodifica non disponibile: HTTP ${response.status}`);
  const [result] = await response.json();
  const lat = Number(result?.lat);
  const lon = Number(result?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Luogo non trovato: ${place}`);
  return { lat, lon, label: result.display_name ?? place };
}

export class MonitorCommandRuntime {
  constructor({ monitorRuntime, stateFile, geocoderUrl = "https://nominatim.openstreetmap.org/search" }) {
    this.monitorRuntime = monitorRuntime;
    this.stateFile = stateFile;
    this.geocoderUrl = geocoderUrl;
  }

  state() {
    const state = readJson(this.stateFile, { wizards: {}, confirmations: {} });
    state.wizards ??= {};
    state.confirmations ??= {};
    const now = Date.now();
    for (const [owner, wizard] of Object.entries(state.wizards)) {
      if (Number(wizard.expiresAt) <= now) delete state.wizards[owner];
    }
    for (const [code, draft] of Object.entries(state.confirmations)) {
      if (Number(draft.expiresAt) <= now) delete state.confirmations[code];
    }
    return state;
  }

  save(state) {
    writeJson(this.stateFile, state);
  }

  list() {
    const entries = this.monitorRuntime.list();
    return entries.length ? entries.map((item) => [
      `${item.enabled ? "🟢" : "⏸️"} ${item.id} — ${item.name}`,
      `ultimo controllo: ${item.lastRun ?? "mai"}; ultimo alert: ${item.lastAlert ?? "mai"}`,
    ].join("\n")).join("\n\n") : "Nessun monitor configurato.";
  }

  async prepare(owner, spec) {
    if (!spec.name.trim()) throw new Error("Il nome non può essere vuoto");
    const location = await geocode(spec.place, this.geocoderUrl);
    const monitor = monitorFrom(spec, location);
    if (!monitor.id) throw new Error("Il nome non produce un ID valido");
    if (this.monitorRuntime.config().monitors.some((item) => item.id === monitor.id)) {
      throw new Error(`Esiste già un monitor con ID ${monitor.id}`);
    }
    const state = this.state();
    const code = crypto.randomBytes(3).toString("hex").toUpperCase();
    state.confirmations[code] = { owner, expiresAt: Date.now() + DRAFT_TTL_MS, monitor };
    delete state.wizards[owner];
    this.save(state);
    return `${formatMonitor(monitor)}\n\nConferma entro 10 minuti con /monitor confirm ${code}\nAnnulla con /monitor cancel ${code}`;
  }

  async continueWizard(owner, text) {
    const state = this.state();
    const wizard = state.wizards[owner];
    if (!wizard || String(text).startsWith("/")) return null;
    if (wizard.stage === "name") {
      wizard.data.name = String(text).trim();
      wizard.stage = "place";
      wizard.expiresAt = Date.now() + DRAFT_TTL_MS;
      this.save(state);
      return "Quale luogo o indirizzo devo monitorare?";
    }
    if (wizard.stage === "place") {
      wizard.data.place = String(text).trim();
      wizard.stage = "radius";
      wizard.expiresAt = Date.now() + DRAFT_TTL_MS;
      this.save(state);
      return "Quale raggio? Esempio: 10 km";
    }
    if (wizard.stage === "radius") {
      wizard.data.radiusKm = parseRadius(text);
      wizard.stage = "layers";
      wizard.expiresAt = Date.now() + DRAFT_TTL_MS;
      this.save(state);
      return "Quali layer? Esempio: earthquakes, wildfire, civil-unrest";
    }
    wizard.data.layers = parseLayers(text);
    return await this.prepare(owner, wizard.data);
  }

  async handle(text, { owner, isAdmin }) {
    if (text === "/monitors" || /^\/monitor\s+list$/i.test(text)) return { handled: true, reply: this.list() };
    if (!/^\/monitor(?:\s|$)/i.test(text)) return { handled: false };
    const create = text.match(/^\/monitor\s+create(?:\s+([\s\S]+))?$/i);
    if (create) {
      if (!isAdmin) return { handled: true, reply: "Comando riservato agli amministratori." };
      if (!create[1]) {
        const state = this.state();
        state.wizards[owner] = { stage: "name", expiresAt: Date.now() + DRAFT_TTL_MS, data: {} };
        this.save(state);
        return { handled: true, reply: "Come vuoi chiamare il nuovo monitor?" };
      }
      return { handled: true, reply: await this.prepare(owner, parseInlineCreate(create[1])) };
    }
    const confirm = text.match(/^\/monitor\s+confirm\s+([A-F0-9]{6})$/i);
    if (confirm) {
      if (!isAdmin) return { handled: true, reply: "Comando riservato agli amministratori." };
      const state = this.state();
      const code = confirm[1].toUpperCase();
      const draft = state.confirmations[code];
      if (!draft || draft.owner !== owner) return { handled: true, reply: "Conferma inesistente, scaduta o appartenente a un’altra chat." };
      this.monitorRuntime.addManagedMonitor(draft.monitor);
      delete state.confirmations[code];
      this.save(state);
      return { handled: true, reply: `Monitor ${draft.monitor.id} creato. La prima esecuzione stabilirà una baseline silenziosa.` };
    }
    const cancel = text.match(/^\/monitor\s+cancel(?:\s+([A-F0-9]{6}))?$/i);
    if (cancel) {
      const state = this.state();
      if (cancel[1]) {
        const code = cancel[1].toUpperCase();
        if (state.confirmations[code]?.owner === owner) delete state.confirmations[code];
      } else {
        delete state.wizards[owner];
      }
      this.save(state);
      return { handled: true, reply: "Operazione monitor annullata." };
    }
    const show = text.match(/^\/monitor\s+show\s+(\S+)$/i);
    if (show) {
      const monitor = this.monitorRuntime.config().monitors.find((item) => item.id === show[1]);
      const listed = this.monitorRuntime.list().find((item) => item.id === show[1]);
      return { handled: true, reply: monitor ? formatMonitor(monitor, listed?.enabled) : `Monitor ${show[1]} non trovato.` };
    }
    const toggle = text.match(/^\/monitor\s+(?:(enable|disable)\s+(\S+)|(\S+)\s+(on|off|pause))$/i);
    if (toggle) {
      const id = toggle[2] ?? toggle[3];
      const enabled = (toggle[1] ?? toggle[4]).toLowerCase() === "enable" || toggle[4]?.toLowerCase() === "on";
      const changed = this.monitorRuntime.setEnabled(id, enabled);
      return { handled: true, reply: changed ? `Monitor ${id} ${enabled ? "attivato" : "sospeso"}.` : `Monitor ${id} non trovato.` };
    }
    if (/^\/monitor\s+brief\s+\S+$/i.test(text)) return { handled: false };
    return { handled: true, reply: "Comandi: /monitor list|show <id>|create|confirm <codice>|cancel [codice]|enable <id>|disable <id>." };
  }
}
