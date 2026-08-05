const EXPIRING_CONTENT_KEYS = new Set([
  "audio",
  "contact",
  "contacts",
  "document",
  "image",
  "liveLocation",
  "location",
  "poll",
  "sticker",
  "text",
  "video",
]);

export function parseEphemeralExpiration(value) {
  const seconds = Number(value ?? 0);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error("WWV_AGENT_EPHEMERAL_EXPIRATION_SECONDS deve essere un intero non negativo");
  }
  return seconds;
}

export function sendOptionsFor(content, options, ephemeralExpiration) {
  const current = options ?? {};
  if (!ephemeralExpiration || !content || typeof content !== "object") return current;
  if (!Object.keys(content).some((key) => EXPIRING_CONTENT_KEYS.has(key))) return current;
  if (current.ephemeralExpiration !== undefined) return current;
  return { ...current, ephemeralExpiration };
}
