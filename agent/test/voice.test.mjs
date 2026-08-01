import assert from "node:assert/strict";
import test from "node:test";
import { audioMessage, speechText } from "../src/voice.mjs";

test("detects direct and ephemeral WhatsApp audio", () => {
  const direct = { message: { audioMessage: { seconds: 4, ptt: true } } };
  const wrapped = { message: { ephemeralMessage: { message: { audioMessage: { seconds: 7 } } } } };
  assert.equal(audioMessage(direct)?.seconds, 4);
  assert.equal(audioMessage(wrapped)?.seconds, 7);
  assert.equal(audioMessage({ message: { conversation: "testo" } }), null);
});

test("prepares markdown responses for speech", () => {
  const result = speechText("## Roma\n**Tre voli** — https://example.test/x");
  assert.equal(result, "Roma Tre voli — link disponibile nella risposta testuale");
});

test("truncates only the spoken copy and points to the complete text", () => {
  const result = speechText("a".repeat(100), 20);
  assert.match(result, /^a{20}\. La risposta completa/);
});
