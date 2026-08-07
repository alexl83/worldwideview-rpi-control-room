import crypto from "node:crypto";
import { readJson, writeJson } from "./monitor.mjs";

const PAIRING_TTL_MS = 10 * 60_000;

export function isGroupJid(value) {
  return /^[0-9]+@g\.us$/.test(String(value ?? ""));
}

function slug(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export class GroupRegistry {
  constructor({ stateFile, allowedGroupJids = [], now = () => Date.now() }) {
    this.stateFile = stateFile;
    this.allowedGroupJids = new Set(allowedGroupJids.filter(isGroupJid));
    this.now = now;
  }

  state() {
    const state = readJson(this.stateFile, { groups: {}, pairings: {}, assignments: {} });
    state.groups ??= {};
    state.pairings ??= {};
    state.assignments ??= {};
    // The private registry is itself an authorization source. Restore enrolled
    // JIDs after every process restart without requiring them in an env file.
    for (const group of Object.values(state.groups)) {
      if (isGroupJid(group?.jid)) this.allowedGroupJids.add(group.jid);
    }
    const now = this.now();
    for (const [code, pairing] of Object.entries(state.pairings)) {
      if (Number(pairing.expiresAt) <= now) delete state.pairings[code];
    }
    return state;
  }

  save(state) {
    writeJson(this.stateFile, state);
  }

  createPairing(owner) {
    const state = this.state();
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    state.pairings[code] = { owner, expiresAt: this.now() + PAIRING_TTL_MS };
    this.save(state);
    return code;
  }

  enroll({ code, jid, enrolledBy, subject }) {
    if (!isGroupJid(jid)) throw new Error("JID gruppo non valido");
    const state = this.state();
    const normalizedCode = String(code ?? "").toUpperCase();
    const pairing = state.pairings[normalizedCode];
    if (!pairing) throw new Error("Codice inesistente o scaduto");
    delete state.pairings[normalizedCode];
    const existing = Object.entries(state.groups).find(([, group]) => group.jid === jid);
    const base = slug(subject) || `group-${jid.split("@")[0].slice(-6)}`;
    let id = existing?.[0] ?? base;
    for (let suffix = 2; !existing && state.groups[id]; suffix += 1) id = `${base}-${suffix}`;
    state.groups[id] = {
      jid,
      name: String(subject ?? id),
      enabled: true,
      enrolledAt: new Date(this.now()).toISOString(),
      enrolledBy,
    };
    this.allowedGroupJids.add(jid);
    this.save(state);
    return { id, ...state.groups[id] };
  }

  list() {
    const state = this.state();
    return Object.entries(state.groups).map(([id, group]) => ({ id, ...group }));
  }

  setEnabled(id, enabled) {
    const state = this.state();
    if (!state.groups[id]) return false;
    state.groups[id].enabled = enabled;
    this.save(state);
    return true;
  }

  assign(monitorId, groupId, enabled) {
    const state = this.state();
    if (!state.groups[groupId]) return false;
    const assigned = new Set(state.assignments[monitorId] ?? []);
    if (enabled) assigned.add(groupId);
    else assigned.delete(groupId);
    state.assignments[monitorId] = [...assigned];
    this.save(state);
    return true;
  }

  targetsForMonitor(monitorId) {
    const state = this.state();
    return (state.assignments[monitorId] ?? [])
      .map((id) => ({ id, ...state.groups[id] }))
      .filter((group) => group.enabled && this.allowedGroupJids.has(group.jid));
  }

  resolve(id) {
    const group = this.state().groups[id];
    if (!group || !group.enabled || !this.allowedGroupJids.has(group.jid)) return null;
    return { id, ...group };
  }
}
