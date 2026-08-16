import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MIME_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function unwrapContent(content) {
  let current = content;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current.imageMessage) return { metadata: current.imageMessage, kind: "image" };
    if (current.documentMessage?.mimetype?.startsWith("image/")) {
      return { metadata: current.documentMessage, kind: "document" };
    }
    current = current.ephemeralMessage?.message
      ?? current.viewOnceMessage?.message
      ?? current.viewOnceMessageV2?.message
      ?? current.documentWithCaptionMessage?.message
      ?? current.editedMessage?.message
      ?? current.associatedChildMessage?.message;
  }
  return null;
}

export function imageMessage(message) {
  return unwrapContent(message?.message);
}

export function extensionForImageMime(mimeType) {
  return MIME_EXTENSIONS.get(String(mimeType ?? "").toLowerCase()) ?? null;
}

export class WhatsAppImageRuntime {
  constructor({ logger, maxInputBytes = 15 * 1024 * 1024 }) {
    this.logger = logger;
    this.maxInputBytes = maxInputBytes;
  }

  async download(message, sock) {
    const attachment = imageMessage(message);
    if (!attachment) return null;
    const mimeType = attachment.metadata.mimetype ?? "image/jpeg";
    const extension = extensionForImageMime(mimeType);
    if (!extension) throw new Error(`Formato immagine non supportato: ${mimeType}`);
    const declaredBytes = Number(attachment.metadata.fileLength ?? 0);
    if (declaredBytes > this.maxInputBytes) {
      throw new Error(`Immagine troppo grande: massimo ${Math.floor(this.maxInputBytes / 1024 / 1024)} MB`);
    }

    const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
    const media = await downloadMediaMessage(message, "buffer", {}, {
      logger: this.logger,
      reuploadRequest: sock.updateMediaMessage,
    });
    if (!Buffer.isBuffer(media) || media.length === 0) {
      throw new Error("Immagine WhatsApp vuota o non scaricabile");
    }
    if (media.length > this.maxInputBytes) {
      throw new Error(`Immagine troppo grande: massimo ${Math.floor(this.maxInputBytes / 1024 / 1024)} MB`);
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwv-image-"));
    const file = path.join(dir, `attachment${extension}`);
    try {
      fs.writeFileSync(file, media, { mode: 0o600 });
      return {
        path: file,
        mimeType,
        size: media.length,
        cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
      };
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw error;
    }
  }
}
