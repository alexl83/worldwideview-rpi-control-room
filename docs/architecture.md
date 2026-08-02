# Architecture and trust boundaries

## Runtime path

1. An allow-listed direct WhatsApp message reaches the Baileys relay.
2. The relay resumes a Codex thread dedicated to that sender.
3. Codex runs with filesystem sandbox mode `read-only` and calls WWV through MCP.
4. WWV routes camera/layer commands to a registered browser session.
5. A systemd-managed Chromium session provides an always-on fallback viewport.
6. The WWV server reads normalized snapshots from the separate data engine.

WhatsApp MCP traffic uses the loopback-only Caddy alias
`http://127.0.0.1:3080/mcp/headless`. Caddy attaches the stable headless session
UUID while Codex sees a query-free URL. This works around a Codex streamable-HTTP
transport failure observed with `?sessionId=...`, without allowing session
selection or exposing port 3080 beyond the Pi.

The browser is part of the execution model: WWV's command bus controls a live
globe session, not a server-side virtual camera. Keeping Chromium on the Pi removes
the dependency on an operator laptop while preserving this model.

Frontend chat travels through an authenticated Next.js route and a Unix socket to
the relay. The browser supplies its tab-scoped session UUID; WWV verifies that the
session belongs to the logged-in user and the MCP URL is pinned to it for the
entire Codex turn. Resources, plugin tools and globe commands cannot fall back to
the persistent headless session. The socket request is authenticated with the
shared `WWV_AGENT_SOCKET_TOKEN` stored in both root-owned environment files.

The keeper stores the stable UUID in browser `sessionStorage` before WWV loads.
It watches the WWV command bridge: when the authenticated SSE stream closes, it
navigates to login, authenticates with the dedicated account and reopens the
globe. Build-ID changes also cause a controlled reload. The profile remains under
`/var/lib/wwv-browser` and is never shared with an interactive browser.

## Monitoring path and data quality

Scheduled monitors read engine snapshots directly; they do not need Chromium or
MCP. Each layer is normalized, filtered by great-circle distance, consolidated
by a stable fingerprint and compared with retained state. The first run is a
silent baseline. A notification requires both a deterministic trigger and an
expired cooldown; Codex only writes the final concise analysis.

The local `conflict-events` seeder reads GDELT Event Database 2.0 exports instead
of treating GKG keyword/location mentions as incidents. It admits only CAMEO
material-conflict roots 18–20, retains the official event ID and source URL, and
does not fabricate casualty figures. Because these records remain machine-coded
news reports, monitors exclude them from automatic triggers by default while
keeping them available for sourced analysis.
Before the engine starts, a one-shot Compose service refreshes the official
seeder bundle and removes only its unsafe `conflictEvents` package. The audited
replacement is then loaded from the read-only local-seeder mount. This preserves
automatic updates for every other upstream collector and is reproducible with a
fresh Docker volume.

The OpenSky collector persists its last successful snapshot in the engine data
volume. OAuth2 is used when configured; anonymous collection is throttled to a
safe daily-credit budget. Cached aircraft are explicitly marked stale with their
source age, so an upstream 429 cannot silently become either a 404 or “live” data.

## HTTPS and plugin compatibility

Caddy is the only LAN-facing application endpoint. `/engine/*` proxies the data
engine and `/api/aviation*` supports Aviation releases that append their API path
to the page origin. The local Aviation wrapper goes one step further and fetches
same-origin `/api/aviation` while reusing the official plugin's rendering and
entity mapping. Disabled marketplace plugins are excluded during bootstrap by
the patched WWV image, preventing removed plugins such as ISS from being imported.

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
| WhatsApp outbound retry cache | `/var/lib/wwv-agent/whatsapp-outbound-messages.json` | Never |
| Chromium cookies/profile | `/var/lib/wwv-browser` | Never |
| Monitor fingerprints/cooldowns | `/var/lib/wwv-agent/monitor-state.json` | Never |
| PostgreSQL/Redis/engine data | Docker named volumes | Never |

The example files contain placeholders only. Keep environment files mode `0600`
and state directories mode `0700`.

## Network boundary

The example Compose file permits configurable binds, but the recommended Caddy
deployment sets both `WWV_BIND` and `WWV_ENGINE_BIND` to `127.0.0.1`. Only ports
80/443 should face the trusted LAN. Port 3080 is explicitly bound to Pi loopback.
`WWV_SKIP_WS_AUTH=true` must never accompany an Internet-exposed engine.
