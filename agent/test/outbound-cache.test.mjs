import test from "node:test";
import assert from "node:assert/strict";
import { findOutboundEntry, outboundKey } from "../src/outbound-cache.mjs";

test("builds an exact outbound cache key", () => {
  assert.equal(
    outboundKey({ remoteJid: "000000000000@s.whatsapp.net", id: "ABC123" }),
    "000000000000@s.whatsapp.net:ABC123",
  );
});

test("finds an exact JID and message ID match", () => {
  const entry = { savedAt: 1, protobuf: "exact" };
  const messages = { "000000000000@s.whatsapp.net:ABC123": entry };
  assert.equal(findOutboundEntry(messages, {
    remoteJid: "000000000000@s.whatsapp.net",
    id: "ABC123",
  }), entry);
});

test("falls back from a LID retry to the stable message ID", () => {
  const entry = { savedAt: 1, protobuf: "phone-jid" };
  const messages = { "000000000000@s.whatsapp.net:ABC123": entry };
  assert.equal(findOutboundEntry(messages, {
    remoteJid: "00000000000000@lid",
    id: "ABC123",
  }), entry);
});

test("uses the newest message when legacy cache keys share an ID", () => {
  const older = { savedAt: 1, protobuf: "older" };
  const newer = { savedAt: 2, messageId: "ABC123", protobuf: "newer" };
  const messages = {
    "one@s.whatsapp.net:ABC123": older,
    "unrelated-key": newer,
  };
  assert.equal(findOutboundEntry(messages, {
    remoteJid: "00000000000000@lid",
    id: "ABC123",
  }), newer);
});

test("does not guess without a message ID", () => {
  assert.equal(findOutboundEntry({}, { remoteJid: "00000000000000@lid" }), undefined);
});
