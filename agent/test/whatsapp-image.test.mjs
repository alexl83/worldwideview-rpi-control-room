import assert from "node:assert/strict";
import test from "node:test";
import { extensionForImageMime, imageMessage } from "../src/whatsapp-image.mjs";

test("detects direct, ephemeral and view-once WhatsApp images", () => {
  const direct = { message: { imageMessage: { mimetype: "image/jpeg" } } };
  const ephemeral = { message: { ephemeralMessage: { message: { imageMessage: { mimetype: "image/png" } } } } };
  const viewOnce = { message: { viewOnceMessageV2: { message: { imageMessage: { mimetype: "image/webp" } } } } };
  assert.equal(imageMessage(direct)?.metadata.mimetype, "image/jpeg");
  assert.equal(imageMessage(ephemeral)?.metadata.mimetype, "image/png");
  assert.equal(imageMessage(viewOnce)?.metadata.mimetype, "image/webp");
});

test("accepts image documents and rejects ordinary documents", () => {
  const image = { message: { documentMessage: { mimetype: "image/png" } } };
  const pdf = { message: { documentMessage: { mimetype: "application/pdf" } } };
  assert.equal(imageMessage(image)?.kind, "document");
  assert.equal(imageMessage(pdf), null);
});

test("maps only supported image MIME types to safe extensions", () => {
  assert.equal(extensionForImageMime("image/jpeg"), ".jpg");
  assert.equal(extensionForImageMime("image/png"), ".png");
  assert.equal(extensionForImageMime("image/webp"), ".webp");
  assert.equal(extensionForImageMime("image/svg+xml"), null);
});
