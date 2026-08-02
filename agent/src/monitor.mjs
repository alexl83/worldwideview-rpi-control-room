import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EARTH_RADIUS_KM = 6371;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function distanceKm(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function unwrapItems(snapshot) {
  const payload = Array.isArray(snapshot) ? snapshot : snapshot?.items ?? [];
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.satellites)) return payload.satellites;
  return Object.entries(payload).map(([id, value]) => (
    value && typeof value === "object" ? { id, ...value } : value
  ));
}

function coordinates(item) {
  const lat = number(item?.latitude ?? item?.lat ?? item?._osint_meta?.coordinates?.lat);
  const lon = number(
    item?.longitude ?? item?.lon ?? item?.lng ?? item?._osint_meta?.coordinates?.lng,
  );
  return lat === undefined || lon === undefined ? null : { lat, lon };
}

function properties(item) {
  return item?.properties && typeof item.properties === "object" ? item.properties : item;
}

function sourceUrl(item, p = properties(item)) {
  return p?.source_url ?? p?.sourceUrl ?? p?.url ?? item?.source_url ?? item?.sourceUrl;
}

function isGdeltConflictMention(layer, item, p = properties(item)) {
  const id = item?.id ?? item?.event_id ?? p?.id ?? p?.event_id;
  return layer === "conflict-events" && /^gdelt-/i.test(String(id ?? ""));
}

function fingerprint(layer, item) {
  const p = properties(item);
  const url = sourceUrl(item, p);
  if (url) {
    return `${layer}:url:${crypto.createHash("sha256").update(String(url)).digest("hex").slice(0, 24)}`;
  }
  const explicit = item?.id ?? item?.event_id ?? item?.hex ?? p?.id ?? p?.event_id ?? p?.hex;
  const volatileId = /^(gdelt|IRW-[^-]+)-\d{10,}-/i.test(String(explicit ?? ""));
  if (explicit && !volatileId) return `${layer}:${String(explicit)}`;
  const stable = JSON.stringify({
    layer,
    lat: coordinates(item)?.lat,
    lon: coordinates(item)?.lon,
    type: p?.type ?? p?.subType,
    place: p?.location ?? p?.place ?? p?.notes,
    time: p?.timestamp ?? p?.date ?? p?.occurredAt,
    summary: p?.event_summary ?? item?.event_summary,
  });
  return `${layer}:${crypto.createHash("sha256").update(stable).digest("hex").slice(0, 24)}`;
}

function normalize(layer, item, center) {
  if (!item || typeof item !== "object") return null;
  const point = coordinates(item);
  if (!point) return null;
  const p = properties(item);
  const url = sourceUrl(item, p);
  const gdeltMention = isGdeltConflictMention(layer, item, p);
  // The upstream conflict-events seeder currently turns keyword matches from
  // GDELT into events, generates random casualty counts and omits provenance
  // from the live snapshot. Such records must never generate operational
  // alerts. If provenance is added later, keep the mention but discard its
  // synthetic casualty figure and label it explicitly as unverified.
  if (gdeltMention && !url) return null;
  const reportedFatalities = number(
    p.fatalities ?? p.casualties ?? item?._osint_meta?.casualties,
  ) ?? 0;
  const fatalities = gdeltMention ? 0 : reportedFatalities;
  return {
    fingerprint: fingerprint(layer, item),
    layer,
    id: String(item.id ?? item.event_id ?? item.hex ?? p.id ?? p.event_id ?? p.hex ?? "unknown"),
    lat: point.lat,
    lon: point.lon,
    distanceKm: Math.round(distanceKm(center, point) * 10) / 10,
    type: p.type ?? p.subType ?? item.type ?? "event",
    subtype: p.subType,
    location: p.location ?? p.place ?? p.notes ?? item.location,
    fatalities,
    fatalitiesMin: fatalities,
    fatalitiesMax: fatalities,
    fatalitiesReported: gdeltMention ? reportedFatalities : undefined,
    fatalitiesVerified: !gdeltMention,
    variantCount: 1,
    magnitude: number(p.magnitude),
    timestamp: p.timestamp ?? p.date ?? p.occurredAt ?? p.last_updated,
    source: p.source ?? item.source,
    sourceUrl: url,
    verification: gdeltMention ? "unverified_keyword_mention" : "source_report",
    summary: p.event_summary ?? p.notes ?? item.event_summary,
  };
}

function consolidateEvents(events) {
  const consolidated = new Map();
  for (const event of events) {
    const existing = consolidated.get(event.fingerprint);
    if (!existing) {
      consolidated.set(event.fingerprint, event);
      continue;
    }
    existing.fatalitiesMin = Math.min(existing.fatalitiesMin, event.fatalitiesMin);
    existing.fatalitiesMax = Math.max(existing.fatalitiesMax, event.fatalitiesMax);
    existing.fatalities = existing.fatalitiesMax;
    existing.variantCount += 1;
    if (!existing.sourceUrl && event.sourceUrl) existing.sourceUrl = event.sourceUrl;
    if (!existing.source && event.source) existing.source = event.source;
  }
  return [...consolidated.values()];
}

function isAviation(layer) {
  return /aviation|aircraft|flight/i.test(layer);
}

function matchesTrigger(event, triggers = {}) {
  if (triggers.minimumFatalities !== undefined
      && event.fatalities >= Number(triggers.minimumFatalities)) return true;
  if (triggers.minimumMagnitude !== undefined
      && event.magnitude !== undefined
      && event.magnitude >= Number(triggers.minimumMagnitude)) return true;
  if (triggers.aircraftEnteringArea && isAviation(event.layer)) return true;
  return triggers.newEvents === true;
}

export function evaluateMonitor(config, snapshots, previous = {}, now = Date.now()) {
  const center = { lat: Number(config.center.lat), lon: Number(config.center.lon) };
  const radiusKm = Number(config.radiusKm ?? 50);
  const collected = [];
  const feeds = [];

  for (const layer of config.layers ?? []) {
    const result = snapshots[layer];
    if (!result?.ok) {
      feeds.push({ layer, ok: false, error: result?.error ?? "unavailable" });
      continue;
    }
    const events = unwrapItems(result.data)
      .map((item) => normalize(layer, item, center))
      .filter((event) => event && event.distanceKm <= radiusKm);
    collected.push(...events);
    feeds.push({ layer, ok: true, count: events.length, fetchedAt: result.data?.fetchedAt });
  }

  const current = consolidateEvents(collected);
  const baseline = !previous.initialized;
  const seen = previous.seen ?? {};
  const unseen = current.filter((event) => !seen[event.fingerprint]);
  let triggered = baseline ? [] : unseen.filter((event) => matchesTrigger(event, config.triggers));
  const increase = current.length - Number(previous.eventCount ?? current.length);
  const increaseThreshold = Number(config.triggers?.eventCountIncrease ?? 0);
  if (!baseline && increaseThreshold > 0 && increase >= increaseThreshold && triggered.length === 0) {
    triggered = unseen;
  }

  const retentionMs = Number(config.seenRetentionHours ?? 168) * 3600_000;
  const nextSeen = Object.fromEntries(
    Object.entries(seen).filter(([, timestamp]) => now - Number(timestamp) < retentionMs),
  );
  for (const event of current) nextSeen[event.fingerprint] = now;

  return {
    baseline,
    current,
    triggered,
    feeds,
    increase,
    nextState: {
      initialized: true,
      lastRun: new Date(now).toISOString(),
      eventCount: current.length,
      seen: nextSeen,
    },
  };
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export class MonitorRuntime {
  constructor({ configFile, stateFile, engineUrl, logger, analyze, notify }) {
    this.configFile = configFile;
    this.stateFile = stateFile;
    this.engineUrl = engineUrl.replace(/\/+$/, "");
    this.logger = logger;
    this.analyze = analyze;
    this.notify = notify;
    this.running = new Set();
  }

  config() {
    return readJson(this.configFile, { monitors: [] });
  }

  state() {
    return readJson(this.stateFile, { monitors: {}, overrides: {} });
  }

  list() {
    const state = this.state();
    return (this.config().monitors ?? []).map((monitor) => ({
      id: monitor.id,
      name: monitor.name ?? monitor.id,
      enabled: state.overrides?.[monitor.id] ?? monitor.enabled !== false,
      lastRun: state.monitors?.[monitor.id]?.lastRun,
      lastAlert: state.monitors?.[monitor.id]?.lastAlert,
    }));
  }

  setEnabled(id, enabled) {
    const config = this.config();
    if (!(config.monitors ?? []).some((monitor) => monitor.id === id)) return false;
    const state = this.state();
    state.overrides ??= {};
    state.overrides[id] = enabled;
    writeJson(this.stateFile, state);
    return true;
  }

  async snapshots(layers) {
    const entries = await Promise.all(layers.map(async (layer) => {
      try {
        const response = await fetch(`${this.engineUrl}/api/${encodeURIComponent(layer)}`, {
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return [layer, { ok: true, data: await response.json() }];
      } catch (error) {
        return [layer, { ok: false, error: error.message }];
      }
    }));
    return Object.fromEntries(entries);
  }

  async run(id, { force = false, notify = true, persist = true } = {}) {
    const monitor = (this.config().monitors ?? []).find((item) => item.id === id);
    if (!monitor) throw new Error(`Monitor sconosciuto: ${id}`);
    if (this.running.has(id)) return { skipped: "already-running" };
    this.running.add(id);
    try {
      const state = this.state();
      const previous = state.monitors?.[id] ?? {};
      const snapshots = await this.snapshots(monitor.layers ?? []);
      const result = evaluateMonitor(monitor, snapshots, previous);
      const cooldownMs = Number(monitor.notification?.cooldownMinutes ?? 30) * 60_000;
      const cooldownActive = previous.lastAlert
        && Date.now() - Date.parse(previous.lastAlert) < cooldownMs;
      const shouldAlert = !result.baseline && result.triggered.length > 0
        && (!cooldownActive || force);
      const next = { ...previous, ...result.nextState };
      if (shouldAlert) next.lastAlert = new Date().toISOString();
      if (persist) {
        state.monitors ??= {};
        state.monitors[id] = next;
        writeJson(this.stateFile, state);
      }

      this.logger.info({
        id,
        baseline: result.baseline,
        events: result.current.length,
        newEvents: result.triggered.length,
        shouldAlert,
        cooldownActive: Boolean(cooldownActive),
        persisted: persist,
      }, "monitor check completed");

      if (shouldAlert && notify) {
        const text = await this.analyze(monitor, result);
        await this.notify(monitor, text);
      }
      return { ...result, shouldAlert, cooldownActive };
    } finally {
      this.running.delete(id);
    }
  }

  async tick() {
    const now = Date.now();
    const state = this.state();
    for (const monitor of this.config().monitors ?? []) {
      const enabled = state.overrides?.[monitor.id] ?? monitor.enabled !== false;
      const lastRun = Date.parse(state.monitors?.[monitor.id]?.lastRun ?? 0);
      const intervalMs = Math.max(60, Number(monitor.intervalSeconds ?? 300)) * 1000;
      if (enabled && now - lastRun >= intervalMs) {
        try {
          // Serialize checks because each run atomically replaces the shared
          // state document. Parallel writes could drop another monitor's state.
          await this.run(monitor.id);
        } catch (error) {
          this.logger.error({ error, id: monitor.id }, "monitor failed");
        }
      }
    }
  }
}
