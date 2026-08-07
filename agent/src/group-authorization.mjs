function normalize(value) {
  return String(value ?? "").split("@")[0].replace(/[^0-9]/g, "");
}

function senderAliases(msg) {
  return [msg?.key?.participantAlt, msg?.key?.participant].filter(Boolean);
}

export function authorizeGroupOperator(msg, metadata, allowedNumbers, allowedIdentities) {
  const aliases = senderAliases(msg);
  const identities = new Set(aliases.map(normalize).filter(Boolean));
  const allowListed = [...identities].some((identity) => (
    allowedNumbers.has(identity) || allowedIdentities.has(identity)
  ));
  if (!allowListed) return false;

  const exact = new Set(aliases);
  return (metadata?.participants ?? []).some((participant) => {
    if (!participant.admin && !participant.isAdmin && !participant.isSuperAdmin) return false;
    return [participant.id, participant.jid, participant.lid].filter(Boolean)
      .some((alias) => exact.has(alias) || identities.has(normalize(alias)));
  });
}
