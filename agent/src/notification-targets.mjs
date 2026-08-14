export function notificationTargets(monitor, { allowedNumbers, groups }) {
  const result = new Map();
  const configured = monitor.notification?.targets;
  if (Array.isArray(configured)) {
    for (const target of configured) {
      if (target?.type === "phone") {
        const number = String(target.number ?? "").replace(/[^0-9]/g, "");
        if (allowedNumbers.has(number)) result.set(`${number}@s.whatsapp.net`, { jid: `${number}@s.whatsapp.net`, type: "phone" });
      } else if (target?.type === "group") {
        const group = groups.resolve(String(target.group ?? ""));
        if (group) result.set(group.jid, { jid: group.jid, type: "group", id: group.id });
      }
    }
  } else {
    const recipients = monitor.notification?.recipients;
    const numbers = Array.isArray(recipients) && recipients.length
      ? recipients.map((value) => String(value).replace(/[^0-9]/g, "")).filter((number) => allowedNumbers.has(number))
      : [...allowedNumbers].slice(0, 1);
    for (const number of numbers) result.set(`${number}@s.whatsapp.net`, { jid: `${number}@s.whatsapp.net`, type: "phone" });
  }
  for (const group of groups.targetsForMonitor(monitor.id)) {
    result.set(group.jid, { jid: group.jid, type: "group", id: group.id });
  }
  return [...result.values()];
}

export async function resolveNotificationJid(target, socket, logger) {
  if (target?.type !== "phone" || !target.jid?.endsWith("@s.whatsapp.net")) {
    return target?.jid;
  }

  try {
    const lid = await socket?.signalRepository?.lidMapping?.getLIDForPN?.(target.jid);
    if (typeof lid === "string" && (lid.endsWith("@lid") || lid.endsWith("@hosted.lid"))) {
      return lid;
    }
  } catch (error) {
    logger?.warn?.({ err: error }, "WhatsApp notification LID resolution failed; using phone JID");
  }

  return target.jid;
}
