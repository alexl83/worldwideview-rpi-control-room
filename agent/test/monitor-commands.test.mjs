import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MonitorCommandRuntime, parseInlineCreate, parseLayers, parseRadius } from "../src/monitor-commands.mjs";
import { MonitorRuntime, readJson, writeJson } from "../src/monitor.mjs";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wwv-monitor-command-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configFile = path.join(directory, "base.json");
  const managedConfigFile = path.join(directory, "managed.json");
  writeJson(configFile, { monitors: [] });
  const monitorRuntime = new MonitorRuntime({
    configFile,
    managedConfigFile,
    stateFile: path.join(directory, "state.json"),
    engineUrl: "http://127.0.0.1:1",
    logger: { info() {}, error() {} },
    analyze: async () => "",
    notify: async () => {},
  });
  return { directory, managedConfigFile, monitorRuntime };
}

async function geocoder(t) {
  const server = http.createServer((request, response) => {
    assert.match(request.url, /q=Legnano/);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify([{ lat: "45.598", lon: "8.918", display_name: "Legnano, Milano, Italia" }]));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/search`;
}

test("parses monitor radius, layers and compact creation syntax", () => {
  assert.equal(parseRadius("10 km"), 10);
  assert.deepEqual(parseLayers("terremoti, incendi, civil-unrest"), [
    "earthquakes", "wildfire", "civil-unrest",
  ]);
  assert.deepEqual(parseInlineCreate('"Casa" "Legnano" 10km earthquakes,wildfire'), {
    name: "Casa",
    place: "Legnano",
    radiusKm: 10,
    layers: ["earthquakes", "wildfire"],
  });
  assert.throws(() => parseRadius("900 km"), /1 e 500/);
  assert.throws(() => parseLayers("unknown"), /non riconosciuti/);
});

test("creates a confirmed managed monitor with a silent-baseline configuration", async (t) => {
  const files = fixture(t);
  const commands = new MonitorCommandRuntime({
    monitorRuntime: files.monitorRuntime,
    stateFile: path.join(files.directory, "commands.json"),
    geocoderUrl: await geocoder(t),
  });
  const prepared = await commands.handle(
    '/monitor create "Casa" "Legnano" 10km earthquakes,wildfire',
    { owner: "synthetic-owner", isAdmin: true },
  );
  const code = prepared.reply.match(/\/monitor confirm ([A-F0-9]{6})/)[1];
  assert.equal(readJson(files.managedConfigFile, { monitors: [] }).monitors.length, 0);

  const confirmed = await commands.handle(`/monitor confirm ${code}`, {
    owner: "synthetic-owner",
    isAdmin: true,
  });
  assert.match(confirmed.reply, /baseline silenziosa/);
  const [monitor] = readJson(files.managedConfigFile, { monitors: [] }).monitors;
  assert.equal(monitor.id, "casa");
  assert.deepEqual(monitor.center, { lat: 45.598, lon: 8.918 });
  assert.equal(monitor.triggers.minimumMagnitude, 2.5);
});

test("guided creation collects fields and non-admin creation is rejected", async (t) => {
  const files = fixture(t);
  const commands = new MonitorCommandRuntime({
    monitorRuntime: files.monitorRuntime,
    stateFile: path.join(files.directory, "commands.json"),
    geocoderUrl: await geocoder(t),
  });
  const denied = await commands.handle("/monitor create", { owner: "guest", isAdmin: false });
  assert.match(denied.reply, /amministratori/);

  assert.match((await commands.handle("/monitor create", { owner: "admin", isAdmin: true })).reply, /chiamare/);
  assert.match(await commands.continueWizard("admin", "Casa"), /luogo/);
  assert.match(await commands.continueWizard("admin", "Legnano"), /raggio/);
  assert.match(await commands.continueWizard("admin", "10 km"), /layer/);
  assert.match(await commands.continueWizard("admin", "earthquakes, wildfire"), /\/monitor confirm/);
});
