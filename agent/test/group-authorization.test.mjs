import assert from "node:assert/strict";
import test from "node:test";
import { authorizeGroupOperator } from "../src/group-authorization.mjs";

const message = {
  key: {
    participant: "123456789012345@lid",
    participantAlt: "39111222333@s.whatsapp.net",
  },
};
const metadata = {
  participants: [{
    id: "123456789012345@lid",
    lid: "123456789012345@lid",
    jid: "39111222333@s.whatsapp.net",
    admin: "admin",
  }],
};

test("requires both WhatsApp group admin role and relay allow-list", () => {
  assert.equal(authorizeGroupOperator(message, metadata, new Set(["39111222333"]), new Set()), true);
  assert.equal(authorizeGroupOperator(message, metadata, new Set(), new Set(["123456789012345"])), true);
  assert.equal(authorizeGroupOperator(message, metadata, new Set(), new Set()), false);
  assert.equal(authorizeGroupOperator(message, {
    participants: [{ ...metadata.participants[0], admin: null }],
  }, new Set(["39111222333"]), new Set()), false);
});

test("an allow-listed member cannot borrow another participant's admin role", () => {
  const otherAdmin = { participants: [{ id: "999999999999999@lid", admin: "admin" }] };
  assert.equal(authorizeGroupOperator(message, otherAdmin, new Set(["39111222333"]), new Set()), false);
});
