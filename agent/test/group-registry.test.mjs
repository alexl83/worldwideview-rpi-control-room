import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GroupRegistry } from "../src/group-registry.mjs";
import { notificationTargets, resolveNotificationJid } from "../src/notification-targets.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wwv-groups-"));
  let now = 1_800_000_000_000;
  const registry = new GroupRegistry({ stateFile: path.join(directory, "groups.json"), now: () => now });
  return { registry, advance: (ms) => { now += ms; } };
}

test("pairing is single use and enrolled groups can be assigned to monitors", () => {
  const { registry } = fixture();
  const code = registry.createPairing("admin@s.whatsapp.net");
  const group = registry.enroll({ code, jid: "120363012345678901@g.us", enrolledBy: "admin", subject: "Family Watch" });
  assert.equal(group.id, "family-watch");
  assert.throws(() => registry.enroll({ code, jid: "120363099999999999@g.us" }), /inesistente|scaduto/);
  assert.equal(registry.assign("kos-watch", group.id, true), true);
  assert.equal(registry.targetsForMonitor("kos-watch")[0].jid, "120363012345678901@g.us");
  const restarted = new GroupRegistry({ stateFile: registry.stateFile });
  assert.equal(restarted.targetsForMonitor("kos-watch")[0].jid, "120363012345678901@g.us");
  assert.equal(restarted.setMonitorEnabled("kos-watch", group.id, false), true);
  assert.deepEqual(restarted.targetsForMonitor("kos-watch"), []);
  assert.equal(restarted.monitorEnabled("kos-watch", group.id), false);
  restarted.setMonitorEnabled("kos-watch", group.id, true);
  assert.equal(restarted.targetsForMonitor("kos-watch").length, 1);
});

test("expired pairing cannot enroll a group", () => {
  const { registry, advance } = fixture();
  const code = registry.createPairing("admin");
  advance(10 * 60_000 + 1);
  assert.throws(() => registry.enroll({ code, jid: "120363012345678901@g.us" }), /inesistente|scaduto/);
});

test("typed and assigned targets preserve phone allow-list and group policy", () => {
  const { registry } = fixture();
  const code = registry.createPairing("admin");
  registry.enroll({ code, jid: "120363012345678901@g.us", enrolledBy: "admin", subject: "Family" });
  registry.assign("watch", "family", true);
  const targets = notificationTargets({
    id: "watch",
    notification: { targets: [
      { type: "phone", number: "+39 111" },
      { type: "phone", number: "+39 999" },
      { type: "group", group: "family" },
    ] },
  }, { allowedNumbers: new Set(["39111"]), groups: registry });
  assert.deepEqual(targets.map((target) => target.jid).sort(), ["120363012345678901@g.us", "39111@s.whatsapp.net"]);
  assert.deepEqual(notificationTargets({
    id: "silent",
    notification: { targets: [] },
  }, { allowedNumbers: new Set(["39111"]), groups: registry }), []);
});

test("resolves phone notification targets to LIDs while preserving groups", async () => {
  const socket = {
    signalRepository: {
      lidMapping: {
        getLIDForPN: async (jid) => {
          assert.equal(jid, "39111@s.whatsapp.net");
          return "12345678901234@lid";
        },
      },
    },
  };
  assert.equal(await resolveNotificationJid({
    type: "phone", jid: "39111@s.whatsapp.net",
  }, socket), "12345678901234@lid");
  assert.equal(await resolveNotificationJid({
    type: "group", jid: "120363012345678901@g.us",
  }, socket), "120363012345678901@g.us");
});

test("falls back to the phone JID when no LID mapping is available", async () => {
  const socket = {
    signalRepository: { lidMapping: { getLIDForPN: async () => null } },
  };
  assert.equal(await resolveNotificationJid({
    type: "phone", jid: "39111@s.whatsapp.net",
  }, socket), "39111@s.whatsapp.net");
});
