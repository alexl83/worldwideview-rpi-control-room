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

test("conflicting casualty estimates are consolidated into one range", () => {
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
  assert.equal(result.current.length, 1);
  assert.equal(result.current[0].fatalitiesMin, 11);
  assert.equal(result.current[0].fatalitiesMax, 13);
  assert.equal(result.current[0].variantCount, 2);
});
