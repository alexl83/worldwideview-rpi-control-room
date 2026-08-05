import test from "node:test";
import assert from "node:assert/strict";
import { parseEphemeralExpiration, sendOptionsFor } from "../src/whatsapp-send-options.mjs";

test("adds the configured expiration to visible text and audio", () => {
  assert.deepEqual(sendOptionsFor({ text: "alert" }, undefined, 86400), {
    ephemeralExpiration: 86400,
  });
  assert.deepEqual(sendOptionsFor({ audio: Buffer.from("voice") }, { ptt: true }, 86400), {
    ptt: true,
    ephemeralExpiration: 86400,
  });
});

test("does not mark reactions or disabled deployments as ephemeral", () => {
  const reactionOptions = { messageId: "test" };
  assert.equal(sendOptionsFor({ react: { text: "✅" } }, reactionOptions, 86400), reactionOptions);
  assert.deepEqual(sendOptionsFor({ text: "persistent" }, undefined, 0), {});
});

test("preserves an explicit per-message expiration", () => {
  const options = { ephemeralExpiration: 604800 };
  assert.equal(sendOptionsFor({ text: "weekly" }, options, 86400), options);
});

test("accepts zero and rejects invalid expiration settings", () => {
  assert.equal(parseEphemeralExpiration(undefined), 0);
  assert.equal(parseEphemeralExpiration("86400"), 86400);
  assert.throws(() => parseEphemeralExpiration("tomorrow"), /intero non negativo/);
  assert.throws(() => parseEphemeralExpiration("-1"), /intero non negativo/);
});
