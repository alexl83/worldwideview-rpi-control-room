# WorldWideView Raspberry Pi Control Room

A reproducible, CLI-only self-hosting pipeline for running
[WorldWideView](https://github.com/silvertakana/worldwideview) on a Raspberry Pi 5
and controlling it through a local Codex agent over WhatsApp Web.

The stack keeps a Chromium globe session alive on the Pi, so the agent can move
the camera and toggle layers even when no laptop browser is open. Builds happen
natively as ARM64 containers on a faster Mac and are transferred incrementally
to the Pi through a temporary local registry and an SSH reverse tunnel.

## Architecture

```text
WhatsApp -> Baileys relay -> Codex CLI -> WorldWideView MCP
                                         |
                                         v
                              persistent headless globe
                                         |
                         WWV + data engine + Postgres + Redis

Mac/Colima -- ARM64 build -> local registry -- SSH tunnel -> Raspberry Pi
```

LAN browsers enter through Caddy at `https://porpolino.local`. The WWV and data
engine container ports stay on loopback; Caddy proxies the UI, engine stream,
legacy Aviation API and a loopback-only MCP alias pinned to the headless globe.

No OpenAI API key is required: the service account authenticates the Codex CLI
with an eligible ChatGPT subscription. WorldWideView and Google Maps credentials
remain in root-owned environment files on the Pi.

## What is included

- `agent/`: allow-listed WhatsApp Web relay with one native Codex thread per chat,
  plus fully local Italian speech recognition and synthesis. Voice notes receive
  the complete text answer followed by audio; written queries remain text-only.
- automatic geofenced monitoring with silent baseline, deduplication and cooldown.
- securely enrolled WhatsApp groups as passive, per-monitor alert destinations;
  group messages never invoke Codex or control WorldWideView.
- configurable concurrent watch profiles (center, radius, layers, interval,
  trigger thresholds, retention, recipients and cooldown), including earthquakes.
- sourced GDELT Event 2.0 ingestion with stable IDs, CAMEO classification and no
  synthetic casualty figures; machine-coded reports are non-alerting by default.
- authenticated frontend chat pinned to the originating WWV browser tab.
- `headless/`: persistent Chromium session controlled by the WWV command bus,
  with stable UUID, build refresh and automatic login recovery when its SSE
  command stream loses authentication.
- `compose/`: Pi deployment for WWV, its data engine, PostgreSQL and Redis.
- `caddy/`: local HTTPS gateway, private CA, engine compatibility routes and
  query-free headless MCP alias for Codex CLI.
- `plugins/aviation/`: same-origin compatibility wrapper that prevents the
  official Aviation plugin from falling back to an incorrect/cloud engine URL.
- `scripts/`: Pi installer plus ARM64 cross-build/deploy with automatic rollback.
- `systemd/`: hardened, boot-enabled service templates.
- `config/`: secret-free configuration examples and Codex/WWV agent guidance.
- `patches/`: upstream issues and the fixes used by this deployment.
- `seeders/`: local data adapters missing from the stock self-hosted engine.

## Prerequisites

On the Mac: Docker CLI, Colima, `buildx`, SSH and rsync. On the Pi: Debian ARM64,
Docker Engine with Compose v2, Node.js 22+, Chromium, Codex CLI, SSH access and a
sudo-capable operator account.

The WorldWideView source and the data-engine image are intentionally not
vendored. Clone/build those upstream projects separately, then use this repo as
the deployment and control plane.

The local Aviation seeder supplies the OpenSky endpoint expected by the official
frontend plugin, which is absent from the stock self-hosted seeder set. Anonymous
access works with a conservative 20-minute polling cadence and persisted fallback
data. For five-minute live polling, create an OpenSky account and API client, then
set `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` in
`/etc/worldwideview.env`; an OpenSky username/password is not used by the API.

## Quick start

1. Clone this repository and WorldWideView on the Mac.
2. Copy `compose/docker-compose.rpi.yml` into the WWV checkout on the Pi.
3. Copy the three files under `config/*.env.example` to their documented paths,
   remove the `.example` suffix and fill in the values. Configure watches using
   `config/wwv-monitors.json.example`.
4. Install the runtime components on the Pi:

   ```bash
   sudo WWV_USER="$USER" ./scripts/install-rpi.sh
   ```

5. Authenticate Codex as the service user and configure the WWV MCP endpoint:

   ```bash
   codex login
   mkdir -p ~/.codex
   # Merge config/codex-config.toml.example into ~/.codex/config.toml.
   ```

6. Start WWV, pair WhatsApp, then enable the long-running services:

   ```bash
   sudo docker compose --env-file /etc/worldwideview.env \
     -f /srv/worldwideview/docker-compose.rpi.yml up -d
   sudo -u "$USER" node /opt/wwv-agent/src/relay.mjs pair
   sudo systemctl enable --now wwv-headless-browser wwv-agent
   ```

7. From the Mac WWV checkout, configure and deploy:

   ```bash
   TARGET=your-pi.local \
   PUBLIC_ENGINE_URL=http://your-pi.local:5000 \
   /path/to/this-repo/scripts/build-deploy-arm64.sh
   ```

See [docs/operations.md](docs/operations.md) for setup, upgrades, recovery and
validation. See [docs/architecture.md](docs/architecture.md) for trust boundaries.

## Interaction surfaces

| Surface | Globe session | Input/output |
| --- | --- | --- |
| WhatsApp direct chat | Stable headless Pi session | Text; voice notes receive transcript, text and voice reply |
| WWV local-agent panel | The exact authenticated browser tab that opened it | Text |
| Automatic monitors | No browser required for detection | WhatsApp alert only after deterministic trigger |

WhatsApp never selects an operator's desktop tab. Frontend chat never falls back
to the headless session. This deliberate separation prevents a remote request
from unexpectedly moving a globe open on another computer.

WhatsApp replies and automatic alerts can be made ephemeral with
`WWV_AGENT_EPHEMERAL_EXPIRATION_SECONDS`. The relay applies that lifetime to
every user-visible text and voice message it sends; see
[`docs/operations.md`](docs/operations.md#whatsapp-disappearing-messages) for
supported values and the interaction with the official WhatsApp client.

## Security notes

This is a personal/LAN control room, not an Internet-facing reference
architecture. Bind ports 3000 and 5000 to loopback and expose only Caddy to the
trusted LAN or VPN. Never commit `/etc/*.env`, `.codex`, WhatsApp auth state,
Chromium profiles or QR
codes. The relay rejects groups and non-allow-listed numbers and launches Codex in
read-only mode. Baileys is an unofficial WhatsApp Web client, so use a dedicated
number and understand the account-risk trade-off.

## Status

The pipeline is running on a Raspberry Pi 5 (ARM64) with automatic boot, health
checks, persistent browser control and deploy rollback. Signal transport is not
implemented in this repository.

## License

Copyright © 2026 Alex Lannocca.

This project is free software licensed under the GNU General Public License,
version 3 or (at your option) any later version (`GPL-3.0-or-later`). See
[LICENSE](LICENSE) for the complete terms.

Versions previously published under the MIT License remain available under the
terms granted with those versions.
