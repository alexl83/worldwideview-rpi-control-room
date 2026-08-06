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

Keep real telephone numbers in `WWV_AGENT_ALLOWED_NUMBERS`. Some WhatsApp
accounts arrive from Baileys under an opaque LID and occasionally omit the
phone-number alias; authorize such an observed identity separately through
`WWV_AGENT_ALLOWED_IDENTITIES`. LIDs may identify an account and must remain in
the private environment file, never in this repository. They authorize inbound
commands only: automatic monitor recipients are selected exclusively from real
numbers in `WWV_AGENT_ALLOWED_NUMBERS` or from a monitor's explicit recipients.

### WhatsApp disappearing messages

Baileys does not keep a persistent chat store from which the relay can reliably
inherit a disappearing-message timer configured in the official client. Set
`WWV_AGENT_EPHEMERAL_EXPIRATION_SECONDS=86400` to mark every user-visible relay
text, voice response and automatic monitor alert as expiring after 24 hours.
Zero disables expiration. Reactions and protocol messages are deliberately left
untouched. Keep this value aligned with the timer shown by the official client;
changing the client setting alone does not reconfigure the service.

Common values are:

| Lifetime | Value in seconds |
| --- | ---: |
| Disabled | `0` |
| 24 hours | `86400` |
| 7 days | `604800` |
| 90 days | `7776000` |

After editing `/etc/wwv-agent.env`, apply the new value with:

```bash
sudo systemctl restart wwv-agent
sudo systemctl is-active wwv-agent
```

The official client controls the visible conversation setting and informs users
that disappearing messages are enabled. The relay separately controls the
expiration metadata of messages originating from its linked-device session. If
the values disagree, WhatsApp may warn that a particular message will remain
visible. The relay cannot make already-sent messages ephemeral retroactively.

Edit `/etc/wwv-monitors.json` to define geofenced watches. Each monitor specifies
its center, radius, data-engine layers, polling interval, triggers and cooldown.
When `notification.recipients` is omitted, alerts go to the first allow-listed
number. The first successful run is always a silent baseline.
The service account must be able to read this file; the installer uses ownership
`root:<service-user>` and mode `0640`.

### Managing monitors through WhatsApp

Set `WWV_AGENT_ADMIN_NUMBERS` and, when an administrator is received only under
an opaque LID, `WWV_AGENT_ADMIN_IDENTITIES`. These are separate from the broader
operator allow-list. An administrator can start the guided creator with:

```text
/monitor create
```

The compact form is:

```text
/monitor create "Name" "Place or address" 10km earthquakes,wildfire,civil-unrest
```

The alternate `Name | Place | Radius | Layers` form is accepted as well. The
relay geocodes the place through `WWV_AGENT_GEOCODER_URL` (Nominatim by default),
shows coordinates, radius, layers and generated ID, then requires a six-character
confirmation from the same chat within ten minutes. Place text is sent to the
configured geocoding provider; point the variable at an approved compatible
endpoint if this is a privacy concern.

```text
/monitor confirm A1B2C3
/monitor cancel A1B2C3
```

Confirmed entries are written atomically to
`/var/lib/wwv-agent/managed-monitors.json`, which is merged at runtime with the
read-only administrative file `/etc/wwv-monitors.json`. The first check is a
silent baseline. Other namespace commands are `/monitor list`,
`/monitor show <id>`, `/monitor enable <id>`, `/monitor disable <id>` and
`/monitor brief <id>`. Existing `/monitors`, `/monitor <id> on|off|pause` and
`/brief <id>` commands remain compatible.

Supported trigger fields are:

- `newEvents`: notify for any newly fingerprinted event;
- `minimumFatalities`: notify when a trustworthy record meets the threshold;
- `minimumMagnitude`: earthquake magnitude threshold;
- `aircraftEnteringArea`: a newly observed aviation entity entered the radius;
- `eventCountIncrease`: notify on a sudden increase even when another trigger did
  not select an individual record.

`seenRetentionHours` controls deduplication retention. `intervalSeconds` is
clamped to a minimum of 60 seconds. Multiple profiles are checked serially to
avoid lost state updates. Earthquakes can be included simply by adding the
`earthquakes` layer and a `minimumMagnitude` trigger.

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

Install Caddy, copy `caddy/Caddyfile` to `/etc/caddy/Caddyfile`, and restart it.
The supplied site has the LAN and ZeroTier names `https://porpolino.local` and
`https://porpolino.cambogio.corp`; Caddy issues an internal leaf certificate valid
for each requested SNI name under the same private CA. The data engine is proxied
below `/engine`. Export Caddy's root certificate from
`/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt` and trust it
once on every client. Keep ports 3000 and 5000 bound to `127.0.0.1`. Both
`NEXTAUTH_URL` and `BETTER_AUTH_URL` must use the external HTTPS origin (without
the old `:3000` port), otherwise authenticated plugin API calls are rejected.
Add both HTTPS origins to `BETTER_AUTH_TRUSTED_ORIGINS`. The same Caddy root CA
must be trusted on every device connecting through ZeroTier; changing the DNS SAN
does not require a new CA installation when that root is already trusted.
The supplied Caddyfile also exposes `127.0.0.1:3080/mcp/headless`. Do not change
that listener to `0.0.0.0`: it exists only so Codex can reach a session-pinned MCP
endpoint without putting the UUID in its URL query string.

## Google Maps and place search

Set both `GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in
`/etc/worldwideview.env`. The public value is compiled into the browser bundle;
changing it requires a WWV rebuild, while the private value is used by the
server-side place search routes. Enable Map Tiles API for Photorealistic 3D Tiles
and Places API (New) for addresses and city search. The fork uses the current
Places `searchText` and details endpoints rather than the legacy Places service.

Restrict the browser key by the HTTPS origin and the server key by the deployment
environment where practical. A successful 3D globe does not prove Places is
enabled: validate search separately through `/api/places/search`. Conversely, a
working Places response does not prove Map Tiles entitlement. Never put a real
key in this repository or a screenshot.

## Plugin lifecycle

Plugin enable/disable state is persisted in PostgreSQL. The patched marketplace
bootstrap loads only rows whose `enabled` flag is true, so a disabled plugin is
not imported on refresh. Re-enable it from the installed/disabled marketplace
view or by restoring its enabled state through the authenticated application API;
do not delete database rows merely to hide a plugin. This prevents disabled or
incompatible packages such as the ISS plugin from producing bootstrap errors.

For frontend chat, generate one long random `WWV_AGENT_SOCKET_TOKEN` and place
the same value in `/etc/wwv-agent.env` and `/etc/worldwideview.env`. The Compose
file mounts `/run/wwv-agent` into the WWV container. Requests remain bound to the
tab that opened the chat; closing that tab makes subsequent turns fail rather
than falling back to the headless globe.

Set `WWV_AGENT_HEADLESS_SESSION_ID` in `/etc/wwv-agent.env` to the same stable
UUID used by `WWV_HEADLESS_SESSION_ID` in `/etc/wwv-headless.env`. Every
WhatsApp turn is pinned server-side to that session; interactive frontend chats
remain pinned to their originating browser tab.

The installer also provisions the ARM64 Whisper and Piper runtimes under
`/opt/wwv-voice`. An incoming WhatsApp voice note is normalized locally, then
transcribed in Italian. The relay first shows the recognized sentence, always
sends the complete text answer, and finally adds an Opus voice note. Written
queries never trigger speech synthesis. Audio input is limited by the
`WWV_AGENT_VOICE_MAX_SECONDS` and `WWV_AGENT_VOICE_MAX_BYTES` settings.

## Cross-build and deploy

Run the deploy script from the Mac. `WWV_SOURCE_DIR` must point to the upstream WWV
checkout containing the deployment patches:

```bash
WWV_SOURCE_DIR="$PWD" \
TARGET=your-pi.local \
PUBLIC_ENGINE_URL=http://your-pi.local:5000 \
/path/to/worldwideview-rpi-control-room/scripts/build-deploy-arm64.sh
```

For the Caddy configuration in this repository, build with
`PUBLIC_ENGINE_URL=https://porpolino.local/engine`.

Use `--sync-from-pi` only if the Pi checkout is the source of truth. It deliberately
excludes dependencies and build artifacts.

The source Dockerfile must accept these build arguments:

- `NEXT_PUBLIC_WWV_AGENT_BUS_ENABLED=true`
- `NEXT_PUBLIC_WWV_PLUGIN_DATA_ENGINE_URL=<browser-reachable URL>`

Server-side engine access uses `WWV_PLUGIN_DATA_ENGINE_URL=http://wwv-data-engine:5000`
from Compose; the public variable is baked into the browser bundle.

The stack mounts `/srv/worldwideview/seeders-local` read-only into the engine.
The repository's `seeders/aviation` adapter supplies the civilian OpenSky feed
expected by the official Aviation plugin and polls every five minutes.

The official Aviation frontend package may still resolve the wrong engine URL
behind a reverse proxy. Install the compatibility module at:

```text
/srv/worldwideview/public/plugins-local/aviation/frontend.mjs
```

and set the installed Aviation manifest entry to
`/plugins-local/aviation/frontend.mjs`. The module is provided in
`plugins/aviation/frontend.mjs`. Restart the WWV container after first mounting a
new file below `public/`; a running standalone Next.js server may otherwise keep
returning 404 even though the file is visible inside the container.

## Health and diagnostics

```bash
systemctl status wwv-agent wwv-headless-browser
journalctl -u wwv-agent -u wwv-headless-browser -n 200 --no-pager
sudo docker compose --env-file /etc/worldwideview.env \
  -f /srv/worldwideview/docker-compose.rpi.yml ps
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:5000/health
curl -kfsS https://porpolino.local/api/aviation?lookback=15m >/dev/null
curl -kfsS https://porpolino.local/plugins-local/aviation/frontend.mjs >/dev/null
```

Send `/status` through WhatsApp to verify relay reachability. For a functional
test, ask the agent to move to a named city, enable a known populated layer and
then re-read both camera and layer state.

For voice validation, send the same request as a WhatsApp voice note and verify
the three outputs in order: recognized sentence, complete text response, audio
response. Speech recognition and synthesis are fully local; only the resulting
prompt follows the normal Codex path.

Monitor commands:

```text
/monitors
/monitor tehran-security on
/monitor tehran-security off
/brief tehran-security
```

`/brief` returns the current picture without emitting an automatic notification or
marking new events as seen.
Scheduled checks query the data engine directly; Codex is called only after a
deterministic trigger fires.

Automatic alert safety rules:

- `conflict-events` comes from the 15-minute GDELT Event 2.0 export, restricted
  to material-conflict CAMEO roots 18–20;
- GDELT's stable event ID and source URL are retained and casualty counts are
  never inferred because the Event export does not contain them;
- machine-coded GDELT reports remain visible for analysis but cannot emit an
  automatic alert unless `includeUnverifiedMentions` is explicitly enabled;
- missing records mean “no feed data”, never proof that no real activity exists;
- source links, confidence limitations and consolidated variants must be exposed
  in the generated briefing.

The local Aviation collector uses OpenSky OAuth2 client credentials when
`OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` are present. Without credentials
it limits global requests to one every 20 minutes, below the anonymous daily
credit allowance. Rate limits and transient failures return the persisted
last-good snapshot with `feed_stale`, `feed_age_seconds` and `feed_status`
metadata instead of turning the layer into a 404.

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

If WhatsApp displays “Waiting for this message”, inspect the relay for closed
Signal sessions and retry requests:

```bash
journalctl -u wwv-agent --since '24 hours ago' --no-pager | \
  grep -E 'closed session|Closing session|cached WhatsApp message retry|uncached message'
```

The relay implements Baileys `getMessage`, a persistent outbound protobuf cache,
a five-attempt retry limit and serialized reconnects. This lets WhatsApp request
the original message payload and re-encrypt it after a key-ratchet mismatch. Keep
`whatsapp-outbound-messages.json` mode `0600`; it contains recent message content.
Re-pair only if WhatsApp reports a logout or placeholders persist after both
devices have been online. Back up `whatsapp-auth` before pairing and never run two
relay processes against the same linked-device directory.

Phone-number JIDs and WhatsApp LIDs are deployment data and can identify an
account. Keep both out of source control, logs shared publicly and test fixtures.
The retry implementation does not require a real LID: its alias fallback matches
the stable WhatsApp message ID, so synthetic identifiers provide equivalent test
coverage. Before publishing diagnostics, also redact message bodies, authorization
allowlists and the contents of both `whatsapp-auth` and the outbound cache.

If a receiving device never issues another retry, an administrator can request a
fresh text send without opening a second Baileys session. Write a mode-`0600` JSON
file named `/var/lib/wwv-agent/whatsapp-resend-request.json` containing only a
cached `messageId`, then start `wwv-agent`. Once WhatsApp connects, the relay
recovers the text and recipient from either the current or legacy cache format,
sends it as a new message and deletes the request after success. Media payloads
are deliberately rejected.

Always stop `wwv-agent` before copying `whatsapp-auth`: Baileys updates several
Signal key files independently, so an archive made while the relay is running can
contain an inconsistent snapshot. The safe order is: stop the service, archive
the authentication directory, create the resend request atomically with mode
`0600`, and start the service. Never restore an older authentication snapshot over
a paired session merely to recover a message; its ratchet state may no longer
match the phone, causing `Bad MAC` and “Waiting for this message” on all subsequent
messages. A stale Signal session must be replaced with a clean pairing.

If WhatsApp reports that WWV MCP tools are absent, distinguish the base endpoint
from the pinned session:

```bash
systemctl status wwv-agent wwv-headless-browser caddy
journalctl -u wwv-headless-browser -n 100 --no-pager
sudo sh -c '. /etc/wwv-agent.env; curl --max-time 3 \
  -H "Authorization: Bearer $WWV_API_KEY" \
  -H "Accept: text/event-stream" \
  http://127.0.0.1:3080/mcp/headless'
```

A timeout is expected for a healthy SSE connection; an immediate `409 requested
globe session is not active` is not. The keeper now detects a closed WWV command
stream and logs in automatically. For manual recovery, stop the headless service,
move `/var/lib/wwv-browser/profile` to a timestamped backup, create a fresh
mode-0700 profile owned by the service user, and restart the service.

If Aviation reports 404, test both URLs above. HTTP 200 from the API but 404 from
the module means the public mount needs a WWV restart. HTTP 200 for both followed
by a browser error usually means the installed manifest still points to the CDN;
switch it to the local wrapper and hard-refresh the browser.

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
Large source build directories such as Rust `target/` are also safe to clean with
the language's own command (`cargo clean`) only after confirming the running
service uses an installed binary rather than that build-tree executable.
