export function outboundKey(key) {
  return key?.remoteJid && key?.id ? `${key.remoteJid}:${key.id}` : "";
}

/**
 * WhatsApp may request a retry using a LID JID even though the original
 * outbound message was addressed to a phone-number JID. Message IDs remain
 * stable across those addressing forms, so fall back to the newest ID match.
 */
export function findOutboundEntry(messages, key) {
  const exact = messages[outboundKey(key)];
  if (exact) return exact;
  if (!key?.id) return undefined;

  const suffix = `:${key.id}`;
  let newest;
  for (const [cacheKey, entry] of Object.entries(messages)) {
    if (entry?.messageId !== key.id && !cacheKey.endsWith(suffix)) continue;
    if (!newest || Number(entry.savedAt ?? 0) > Number(newest.savedAt ?? 0)) {
      newest = entry;
    }
  }
  return newest;
}
