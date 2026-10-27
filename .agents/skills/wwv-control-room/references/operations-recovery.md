# Operations and recovery

Read the relevant section of
[`docs/operations.md`](../../../../docs/operations.md) before changing live
state. Diagnose from the outside inward:

1. host time, disk, memory and network;
2. systemd unit state and logs;
3. Docker container health and application health endpoints;
4. WhatsApp transport and allow-list identity;
5. Codex authentication and a real inference;
6. MCP/headless session state;
7. feed freshness, monitor baseline, deduplication and cooldown.

## Service and log discipline

- Use bounded log windows and targeted patterns. Do not dump private message
  contents or authentication stores.
- Distinguish system units from user units before reporting a service inactive.
- Do not restart every component reflexively. Preserve evidence, identify the
  failed boundary, then restart only what requires it.
- After recovery, verify both transport and function. A running PID is not proof
  that `/status`, Codex, MCP or alert delivery works.

## WhatsApp companion recovery

`401 device_removed` or an explicit logout is terminal for that linked-device
session. The service exits with its configuration stop code to prevent a restart
loop.

1. Stop `wwv-agent`.
2. Archive the complete `whatsapp-auth` directory while stopped, then move it to
   a timestamped recovery path. Never overlay an old Signal ratchet onto a newer
   pairing.
3. Create a fresh mode-0700 state directory owned by the service user and start
   one relay process.
4. Deliver the generated PNG privately and have the user pair from the official
   phone. Do not commit or retain QR images.
5. Confirm the expected phone/LID identity, `WhatsApp connected`, completed app
   state sync, monitor checks and a newly sent `/status` response.

Messages sent while the relay was stopped are history, not new commands, and may
need to be sent again.

## Codex authentication recovery

`refresh_token_expired`, `refresh_token_invalidated`, `token_revoked` and other
terminal refresh errors require a fresh login. `codex login status` can describe
the stored credential even when it can no longer refresh.

1. Confirm the error with a minimal `codex exec` as the service user.
2. Preserve the current auth file temporarily, log out that service user, and
   run `codex login --device-auth` inside a persistent `tmux` session.
3. Give the user the private device URL/code and wait for completion. Never
   authorize it on their behalf.
4. Verify `login status` and a real read-only inference from the service working
   directory.
5. Close the `tmux` session and remove the unusable credential backup after
   successful verification. The WhatsApp relay normally need not restart because
   it spawns a fresh Codex process per request.

## Monitor changes

- Root-managed monitors live in the private monitor configuration; monitors
  created through WhatsApp live in the managed overlay. Identify the owner before
  editing.
- Back up configuration and state, make JSON changes atomically, validate with
  `jq`, and preserve the original owner, group and mode. Explicitly test that the
  service user can read the installed file before restart.
- Remove the corresponding monitor-state entry when deleting a monitor so stale
  fingerprints and cooldowns do not survive.
- A first run is a silent baseline. Lack of alerts can be correct; inspect
  `newEvents`, trigger eligibility, feed health, cooldown and recipient routing.
- `/brief` is diagnostic and must not mark events seen or emit automatic alerts.

## Common boundaries

- MCP tools absent: check Caddy's loopback alias and the headless browser's active
  session before blaming Codex.
- Camera command unconfirmed: re-read the same session; never infer movement from
  command acceptance.
- Layer enabled but empty: inspect feed health and freshness. Empty data is not
  real-world absence.
- Aviation/ISS/plugin 404: separately test the engine/API route, local wrapper,
  installed plugin manifest and browser cache.
- WhatsApp “Waiting for this message”: inspect retry/session logs and the outbound
  cache. Do not restore an old authentication snapshot merely to resend content.
- Disk pressure: inspect first; prune unused build cache and aged journals only.
  Never prune volumes or private state as generic cleanup.
