# Architecture and trust boundaries

## Runtime path

1. An allow-listed direct WhatsApp message reaches the Baileys relay.
2. The relay resumes a Codex thread dedicated to that sender.
3. Codex runs with filesystem sandbox mode `read-only` and calls WWV through MCP.
4. WWV routes camera/layer commands to a registered browser session.
5. A systemd-managed Chromium session provides an always-on fallback viewport.
6. The WWV server reads normalized snapshots from the separate data engine.

The browser is part of the execution model: WWV's command bus controls a live
globe session, not a server-side virtual camera. Keeping Chromium on the Pi removes
the dependency on an operator laptop while preserving this model.

## Build and deployment path

The Mac runs an ARM64 Colima VM and builds the WWV image with BuildKit. The image
is pushed to a registry bound only to Mac loopback. During deploy, SSH exposes that
registry as Pi loopback port 55000. The Pi pulls incrementally, tags its current
image as `rollback`, starts the replacement and waits for Docker health. A failed
health check restores the previous tag.

This avoids slow Pi compilation and avoids maintaining a permanent registry or
shipping full image tarballs after every small source change.

## Secrets and persistent state

| Data | Location | Repository? |
| --- | --- | --- |
| WWV/Google credentials | `/etc/worldwideview.env` | Never |
| WWV headless login | `/etc/wwv-headless.env` | Never |
| Sender allow-list | `/etc/wwv-agent.env` | Never |
| Codex OAuth session | service user's `~/.codex` | Never |
| WhatsApp linked-device keys | `/var/lib/wwv-agent` | Never |
| Chromium cookies/profile | `/var/lib/wwv-browser` | Never |
| PostgreSQL/Redis/engine data | Docker named volumes | Never |

The example files contain placeholders only. Keep environment files mode `0600`
and state directories mode `0700`.

## Network boundary

The example Compose file publishes ports 3000 and 5000 because LAN browsers need
the WWV UI and data stream. Bind them to a private interface, restrict them with a
firewall, or place the stack behind a VPN. `WWV_SKIP_WS_AUTH=true` must not be used
on an Internet-exposed data engine.
