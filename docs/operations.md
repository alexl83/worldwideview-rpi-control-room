# Operations

## First installation

Clone WWV to `/srv/worldwideview` on the Pi. Put the Compose file there and build
or tag a compatible data-engine image as `wwv-data-engine:arm64`. Copy
`config/worldwideview.env.example` to `/etc/worldwideview.env`, replace every
placeholder and set mode `0600`.

Run the installer from this repository:

```bash
sudo WWV_USER="$USER" ./scripts/install-rpi.sh
```

Review `/etc/wwv-agent.env` and `/etc/wwv-headless.env`. The WhatsApp allow-list is
comma-separated E.164 digits without `+`, spaces or punctuation.

Edit `/etc/wwv-monitors.json` to define geofenced watches. Each monitor specifies
its center, radius, data-engine layers, polling interval, triggers and cooldown.
When `notification.recipients` is omitted, alerts go to the first allow-listed
number. The first successful run is always a silent baseline.

Authenticate Codex under the same Unix account used by systemd:

```bash
codex login
```

Merge `config/codex-config.toml.example` into `~/.codex/config.toml`, then place the
control-room rules in `/srv/worldwideview/AGENTS.md` or merge them into the local
project instructions.

Start WWV and verify its health:

```bash
sudo docker compose --env-file /etc/worldwideview.env \
  -f /srv/worldwideview/docker-compose.rpi.yml up -d
curl -fsS http://127.0.0.1:3000/api/health
```

Pair the dedicated WhatsApp number interactively. The relay writes a QR PNG in its
state directory as well as displaying a terminal representation:

```bash
sudo -u "$USER" node /opt/wwv-agent/src/relay.mjs pair
```

After pairing:

```bash
sudo systemctl enable --now wwv-headless-browser wwv-agent
```

## Cross-build and deploy

Run the deploy script from the Mac. `WWV_SOURCE_DIR` must point to the upstream WWV
checkout containing the deployment patches:

```bash
WWV_SOURCE_DIR="$PWD" \
TARGET=your-pi.local \
PUBLIC_ENGINE_URL=http://your-pi.local:5000 \
/path/to/worldwideview-rpi-control-room/scripts/build-deploy-arm64.sh
```

Use `--sync-from-pi` only if the Pi checkout is the source of truth. It deliberately
excludes dependencies and build artifacts.

The source Dockerfile must accept these build arguments:

- `NEXT_PUBLIC_WWV_AGENT_BUS_ENABLED=true`
- `NEXT_PUBLIC_WWV_PLUGIN_DATA_ENGINE_URL=<browser-reachable URL>`

Server-side engine access uses `WWV_PLUGIN_DATA_ENGINE_URL=http://wwv-data-engine:5000`
from Compose; the public variable is baked into the browser bundle.

## Health and diagnostics

```bash
systemctl status wwv-agent wwv-headless-browser
journalctl -u wwv-agent -u wwv-headless-browser -n 200 --no-pager
sudo docker compose --env-file /etc/worldwideview.env \
  -f /srv/worldwideview/docker-compose.rpi.yml ps
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:5000/health
```

Send `/status` through WhatsApp to verify relay reachability. For a functional
test, ask the agent to move to a named city, enable a known populated layer and
then re-read both camera and layer state.

Monitor commands:

```text
/monitors
/monitor tehran-security on
/monitor tehran-security off
/brief tehran-security
```

`/brief` returns the current picture without emitting an automatic notification.
Scheduled checks query the data engine directly; Codex is called only after a
deterministic trigger fires.

## Recovery

The deployment script automatically restores `worldwideview-wwv:rollback` when
the new container does not become healthy. To restore it manually:

```bash
sudo docker tag worldwideview-wwv:rollback worldwideview-wwv:latest
sudo docker compose --env-file /etc/worldwideview.env \
  -f /srv/worldwideview/docker-compose.rpi.yml up -d --no-build wwv
```

If WhatsApp disconnects, stop the relay and run `pair` again. Do not delete the
state directory unless you intentionally want to unlink the device.

## Disk maintenance

Inspect before pruning:

```bash
df -h /
sudo docker system df
sudo journalctl --disk-usage
```

Safe routine cleanup removes only unused build cache and old journal entries:

```bash
sudo docker builder prune -f
sudo journalctl --vacuum-time=14d
```

Do not prune volumes: they contain databases, engine snapshots and WWV state.
