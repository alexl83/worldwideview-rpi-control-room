import assert from "node:assert/strict";
import test from "node:test";
import { distanceKm, evaluateMonitor } from "../src/monitor.mjs";

const config = {
  center: { lat: 35.6892, lon: 51.389 },
  radiusKm: 75,
  layers: ["conflict-events", "earthquakes"],
  triggers: { minimumFatalities: 1, minimumMagnitude: 5 },
};

const snapshots = {
  "conflict-events": {
    ok: true,
    data: { items: [{ id: "event-1", latitude: 35.7, longitude: 51.4, properties: { fatalities: 2 } }] },
  },
  earthquakes: {
    ok: true,
    data: { items: [{ id: "quake-1", lat: 35.8, lon: 51.5, magnitude: 5.3 }] },
  },
};

test("distance uses great-circle kilometers", () => {
  assert.ok(distanceKm({ lat: 41.9028, lon: 12.4964 }, { lat: 45.4642, lon: 9.19 }) > 470);
});

test("first evaluation establishes a silent baseline", () => {
  const result = evaluateMonitor(config, snapshots, {}, 1_000);
  assert.equal(result.baseline, true);
  assert.equal(result.current.length, 2);
  assert.equal(result.triggered.length, 0);
});

test("new qualifying events trigger after baseline", () => {
  const baseline = evaluateMonitor(config, snapshots, {}, 1_000);
  const changed = structuredClone(snapshots);
  changed["conflict-events"].data.items.push({
    id: "event-2", lat: 35.75, lon: 51.45, fatalities: 1,
  });
  const result = evaluateMonitor(config, changed, baseline.nextState, 2_000);
  assert.deepEqual(result.triggered.map((event) => event.id), ["event-2"]);
});

test("events outside the radius are excluded", () => {
  const far = { "conflict-events": { ok: true, data: { items: [
    { id: "far", lat: 41.9, lon: 12.5, fatalities: 50 },
  ] } } };
  const result = evaluateMonitor({ ...config, layers: ["conflict-events"] }, far, {}, 1_000);
  assert.equal(result.current.length, 0);
});

test("volatile collector IDs do not turn the same report into a new event", () => {
  const first = { "conflict-events": { ok: true, data: { items: [{
    id: "gdelt-1785616831987-35.7000-51.4000-0",
    latitude: 35.7,
    longitude: 51.4,
    properties: { type: "Battles", date: "2026-08-01T20:30:00Z", notes: "Tehran", fatalities: 2 },
  }] } } };
  const baseline = evaluateMonitor({ ...config, layers: ["conflict-events"] }, first, {}, 1_000);
  first["conflict-events"].data.items[0].id = "gdelt-1785617731987-35.7000-51.4000-0";
  const result = evaluateMonitor(
    { ...config, layers: ["conflict-events"] }, first, baseline.nextState, 2_000,
  );
  assert.equal(result.triggered.length, 0);
});

test("unsourced GDELT conflict mentions with synthetic casualties are rejected", () => {
  const variants = { "conflict-events": { ok: true, data: { items: [
    {
      id: "gdelt-1785616831987-35.7000-51.4000-0",
      latitude: 35.7,
      longitude: 51.4,
      properties: { type: "Battles", date: "2026-08-01T20:30:00Z", notes: "Tehran", fatalities: 11 },
    },
    {
      id: "gdelt-1785616831987-35.7000-51.4000-1",
      latitude: 35.7,
      longitude: 51.4,
      properties: { type: "Battles", date: "2026-08-01T20:30:00Z", notes: "Tehran", fatalities: 13 },
    },
  ] } } };
  const result = evaluateMonitor({ ...config, layers: ["conflict-events"] }, variants, {}, 1_000);
  assert.equal(result.current.length, 0);
  assert.equal(result.triggered.length, 0);
});

test("sourced GDELT mentions retain provenance but never synthetic fatalities", () => {
  const sourced = { "conflict-events": { ok: true, data: { items: [{
    id: "gdelt-1785616831987-45.4667-9.2000-0",
    latitude: 45.4667,
    longitude: 9.2,
    source_url: "https://example.invalid/report-1",
    properties: {
      type: "Battles",
      date: "2026-08-01T20:30:00Z",
      notes: "Milan, Lombardia, Italy",
      fatalities: 14,
    },
  }] } } };
  const localConfig = {
    center: { lat: 45.55, lon: 9.16667 },
    radiusKm: 10,
    layers: ["conflict-events"],
    triggers: { minimumFatalities: 1 },
  };
  const result = evaluateMonitor(localConfig, sourced, {}, 1_000);
  assert.equal(result.current.length, 1);
  assert.equal(result.current[0].fatalities, 0);
  assert.equal(result.current[0].fatalitiesReported, 14);
  assert.equal(result.current[0].fatalitiesVerified, false);
  assert.equal(result.current[0].verification, "unverified_keyword_mention");
  assert.equal(result.triggered.length, 0);
});

test("unverified GDELT mentions do not trigger new-event alerts by default", () => {
  const sourced = { "conflict-events": { ok: true, data: { items: [{
    id: "gdelt-stable",
    latitude: 35.7,
    longitude: 51.4,
    source_url: "https://example.invalid/report",
    verification: "unverified_keyword_mention",
    type: "Battles",
  }] } } };
  const localConfig = { ...config, layers: ["conflict-events"], triggers: { newEvents: true } };
  const baseline = evaluateMonitor(localConfig, { "conflict-events": { ok: true, data: { items: [] } } }, {}, 1_000);
  const result = evaluateMonitor(localConfig, sourced, baseline.nextState, 2_000);
  assert.equal(result.current.length, 1);
  assert.equal(result.triggered.length, 0);
});
