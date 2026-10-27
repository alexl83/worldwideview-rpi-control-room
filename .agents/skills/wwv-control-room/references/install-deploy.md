# Installation and deployment

Use this reference for a new host, configuration changes, certificates, build,
deployment or rollback. The canonical commands and supported variables remain in
[`README.md`](../../../../README.md) and
[`docs/operations.md`](../../../../docs/operations.md); inspect the current
scripts before invoking them.

## Plan the topology

- Mac or another fast ARM64-capable build host: source checkout, Docker/Colima,
  BuildKit and the temporary local registry.
- Raspberry Pi 5 or compatible Debian ARM64 host: Docker Compose, Node.js,
  Chromium, Codex CLI, Caddy and systemd services.
- Private DNS names must resolve over the LAN/VPN. Bind WWV and the engine to
  loopback; expose only Caddy to trusted clients.
- Keep the application fork and control-room repository as separate checkouts.
  Use the reference WWV fork tag from `README.md` unless the user explicitly
  requests an upstream integration.

## Install safely

1. Inspect prerequisites and free space on both machines. Confirm architecture,
   Docker Compose v2, Node and Chromium versions rather than assuming them.
2. Copy only the `.example` configuration files to their documented private
   destinations. Replace every placeholder and set restrictive ownership/modes.
   Do not put real deployment data in the repository.
3. Review `scripts/install-rpi.sh` and run it with the intended service user.
   Installation scripts are preferred over hand-recreating their actions.
4. Authenticate Codex as the same Unix user used by `wwv-agent`. `login status`
   is not a sufficient functional test: run one minimal read-only `codex exec`
   from the service working directory after authentication.
5. Pair WhatsApp only after confirming the allow-list and state directory. QR
   files are short-lived secrets; copy them only when needed and remove all
   temporary copies after successful pairing.
6. Install the local Caddy CA only on explicitly trusted clients. Include every
   approved LAN/VPN DNS name in the Caddy configuration and validate HTTPS from
   those names before relying on browser features that require a secure context.

## Build and deploy

- Prefer [`scripts/build-deploy-arm64.sh`](../../../../scripts/build-deploy-arm64.sh).
  It performs the ARM64 build on the faster host, transfers layers through the
  temporary registry tunnel, tags the installed image for rollback and waits for
  health.
- Review its inputs and the current checkout before execution. Never embed the
  server-side Places key in the frontend. The browser Map Tiles key is public by
  design and must be restricted by API and HTTPS referrer.
- Avoid compiling on the Pi when a compatible cross-build host is available.
- On failure, preserve logs and let the script restore the rollback image. Do not
  hide a failed health check by manually marking an image successful.

## Validate

At minimum verify:

1. `docker compose ps` reports WWV, engine, database and Redis healthy.
2. The local WWV and engine health endpoints return success.
3. Caddy serves the configured HTTPS names, engine path and local Aviation
   compatibility resource.
4. `wwv-headless-browser` owns an active globe session and the query-free MCP
   alias remains loopback-only.
5. `wwv-agent` connects to WhatsApp and completes a monitor cycle.
6. A direct-chat `/status` succeeds and a harmless live request operates the
   headless session, while frontend chat remains pinned to its browser tab.

Do not declare installation complete from container startup alone.
