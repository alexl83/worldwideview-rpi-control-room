# Upstream fixes used by this deployment

This is the canonical index of upstream defects discovered while building the
Raspberry Pi control room. It was reconciled against the public issue trackers
and deployed repositories on 2026-08-04. All listed upstream issues were open at
that date; an open issue does not mean that the referenced deployment patch is
untested.

## WorldWideView application

| Issue | Observed defect | Tested deployment patch |
|---|---|---|
| [WWV #374](https://github.com/silvertakana/worldwideview/issues/374) | Docker supplied `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, while the server-side Places routes read only `GOOGLE_MAPS_API_KEY`, leaving search without credentials. | [`f2affdd2`](https://github.com/alexl83/worldwideview/commit/f2affdd2) adds the compatible environment fallback; [`1951b2ba`](https://github.com/alexl83/worldwideview/commit/1951b2ba) completes the Places API New migration. The issue is closed and now contains the tested implementation reference. |
| [WWV #376](https://github.com/silvertakana/worldwideview/issues/376) | A registered but unconfigured community seeder could claim a plugin locally and prevent its working cloud fallback. | [`f2affdd2`](https://github.com/alexl83/worldwideview/commit/f2affdd2) adds a tested operator blocklist as a general escape hatch. Capability-aware manifest registration remains the preferred upstream design. |
| [WWV #385](https://github.com/silvertakana/worldwideview/issues/385) | `crypto.randomUUID()` could be unavailable on an insecure LAN origin and prevent globe session creation. | [`3af1c6e9`](https://github.com/alexl83/worldwideview/commit/3af1c6e9) falls back to an RFC 4122 UUID built with `crypto.getRandomValues()`; HTTPS remains recommended. |
| [WWV #386](https://github.com/silvertakana/worldwideview/issues/386) | Google Maps key verification required the unavailable Places API Legacy instead of testing the Map Tiles capability WWV actually uses. | [`0b447232`](https://github.com/alexl83/worldwideview/commit/0b447232) validates against the Map Tiles API; [`1951b2ba`](https://github.com/alexl83/worldwideview/commit/1951b2ba) migrates place search to Places API New. |
| [WWV #387](https://github.com/silvertakana/worldwideview/issues/387) | Server-side MCP queries ignored the configured data-engine URL and forced localhost. | [`5fce8f08`](https://github.com/alexl83/worldwideview/commit/5fce8f08) honors the configured server-side engine URL. |
| [WWV #388](https://github.com/silvertakana/worldwideview/issues/388) | Indexed-map and nested snapshot shapes reached array-only code and crashed on `.reduce`. | [`0022319e`](https://github.com/alexl83/worldwideview/commit/0022319e) normalizes supported snapshot envelopes before reduction. |
| [WWV #389](https://github.com/silvertakana/worldwideview/issues/389) | Dockerfile layer ordering invalidated the expensive dependency/standalone copy on application-only changes. | [`70dfc50f`](https://github.com/alexl83/worldwideview/commit/70dfc50f) stabilizes the production dependency layer for incremental ARM64 deployment. |
| [WWV #390](https://github.com/silvertakana/worldwideview/issues/390) | Cached root app shells could keep an obsolete command-bus client alive after deployment. | [`4f9a7ae1`](https://github.com/alexl83/worldwideview/commit/4f9a7ae1) prevents stale app-shell caching and exposes build identity for recovery. |
| [WWV #396](https://github.com/silvertakana/worldwideview/issues/396) | A fixed 500 ms local-engine probe permanently cached transient failure and silently routed plugins to cloud endpoints. | [`2ce24c60`](https://github.com/alexl83/worldwideview/commit/2ce24c60) retries failed discovery with a realistic timeout; [`4388cf78`](https://github.com/alexl83/worldwideview/commit/4388cf78) preserves the proxied local-engine URL. |
| [WWV #398](https://github.com/silvertakana/worldwideview/issues/398) | Visible Cesium entities could be unselectable when native scene picking returned no tagged WWV primitive. | [`6a22192e`](https://github.com/alexl83/worldwideview/commit/6a22192e) supports promoted glTF IDs; [`5f8059f9`](https://github.com/alexl83/worldwideview/commit/5f8059f9) adds a bounded screen-space fallback and regression tests. |
| [WWV #409](https://github.com/silvertakana/worldwideview/issues/409) | Plugin enable/disable actions were not persisted and bootstrap re-imported records whose `enabled` flag was false. | [`97119b66`](https://github.com/alexl83/worldwideview/commit/97119b66) persists both actions; [`1fbe8a6c`](https://github.com/alexl83/worldwideview/commit/1fbe8a6c) excludes disabled records during bootstrap. |

The remaining WWV fork extension used by this deployment is not presented as an
upstream bug:

- [`0844ef52`](https://github.com/alexl83/worldwideview/commit/0844ef52): session-pinned, authenticated frontend agent chat over the control room's local Unix-socket relay. This is deployment architecture, not a defect in stock WWV.

## WWV data engine

| Issue | Observed defect | Tested deployment patch |
|---|---|---|
| [wwv-data-engine #24](https://github.com/silvertakana/wwv-data-engine/issues/24) | The manifest exposed seeder directory names such as `civilUnrest` and `gpsjam`, while retained snapshots used canonical IDs such as `civil-unrest` and `gps-jamming`. | The tested patch is attached inline to the issue: enumerate retained `data:*:live` keys and merge their canonical IDs into the manifest. The deployed engine carries this patch. |
| [wwv-data-engine #25](https://github.com/silvertakana/wwv-data-engine/issues/25) | Stock self-hosting lacked `/api/aviation`, although the verified Aviation frontend requires it. | [`b2419dd`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/b2419dd) adds the initial OpenSky adapter; [`63591e7`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/63591e7) adds OAuth, quota-aware polling and last-good snapshots; [`1630fef`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/1630fef) provisions it reproducibly. |

The control room also supplies a same-origin Aviation frontend wrapper and HTTPS
compatibility proxy in [`022c907`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/022c907)
and [`de09205`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/de09205).
These solve deployment compatibility around the upstream feed; they do not turn
military aviation into a civilian-feed alias.

## WWV seeders

| Issue | Observed defect | Tested deployment patch |
|---|---|---|
| [wwv-seeders #10](https://github.com/silvertakana/wwv-seeders/issues/10) | `conflictEvents` converted broad GKG keyword/location mentions into incidents, generated random casualties, omitted source URLs and changed IDs every run. | [`63591e7`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/63591e7) replaces it with sourced GDELT Event Database 2.0 records, stable `GLOBALEVENTID` identifiers and no invented fatalities; [`1630fef`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/1630fef) provisions the audited replacement. |

Downstream monitor policy deliberately keeps machine-coded GDELT records
available for analysis but suppresses automatic alerts unless
`includeUnverifiedMentions` is explicitly enabled.

## Control-room-only compatibility and safety work

The following changes belong to this orchestration repository and are not WWV
upstream defects:

- query-free, loopback-only MCP alias pinned to the persistent headless browser;
- automatic headless reauthentication when the WWV command SSE stream closes;
- deterministic geofenced monitors with serialized state writes, volatile-ID
  deduplication, source validation and casualty-range consolidation;
- OpenSky OAuth, anonymous throttling, rate-limit handling and persisted stale
  status instead of misleading 404 responses;
- HTTPS termination and local CA operation through Caddy;
- allow-listed WhatsApp relay, local voice transcription/synthesis, persistent
  outbound retry cache, phone-JID/LID alias recovery and controlled text resend.

Apply or port the upstream fixes before building WWV/data-engine images. The
linked issues remain the authoritative problem reports and proposed patches; this
index records exactly which implementations the reference deployment currently
uses.
