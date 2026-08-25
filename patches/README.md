# Upstream fixes used by this deployment

This is the canonical index of upstream defects discovered while building the
Raspberry Pi control room. It was reconciled against the public issue trackers
and deployed repositories on 2026-08-26. The deployed fork now uses upstream
commit `6a6f5403` as its base and adds a single integration commit on top. The
table retains the original downstream patch references for traceability even
when an equivalent fix is now present upstream.

## Current integrated baseline

WWV 2.65.38 in the public fork is based on upstream WWV 2.65.37. It directly
adopts upstream's fixes for #385, #387, #388, #396, #398 and #409, plus the
upstream command-stream reconnection work. The integration commit retains only
deployment-specific or still-unmerged behavior: the authenticated session-pinned
frontend agent, Places API New support, Map Tiles key verification, no-cache app
shell and incremental ARM64 Docker layer ordering.

## WorldWideView application

The **deployed source** column describes what is present in
`v2.65.38-control-room.1`. Historical fork commits remain linked only as an
audit trail; they must not be reapplied when the row says **Upstream**.

| Issue | Observed defect | Status | Deployed source |
|---|---|---|---|
| [WWV #374](https://github.com/silvertakana/worldwideview/issues/374) | Docker supplied `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, while the server-side Places routes read only `GOOGLE_MAPS_API_KEY`, leaving search without credentials. | **Fork** | The compatible credential fallback and Places API New implementation are retained in integration commit [`e7985f58`](https://github.com/alexl83/worldwideview/commit/e7985f58). Historical commits: [`f2affdd2`](https://github.com/alexl83/worldwideview/commit/f2affdd2), [`1951b2ba`](https://github.com/alexl83/worldwideview/commit/1951b2ba). |
| [WWV #376](https://github.com/silvertakana/worldwideview/issues/376) | A registered but unconfigured community seeder could claim a plugin locally and prevent its working cloud fallback. | **Retired** | The former operator blocklist from [`f2affdd2`](https://github.com/alexl83/worldwideview/commit/f2affdd2) was deliberately not reapplied. The deployment now uses upstream manifest handling and persistent plugin disablement; this row is retained to explain the historical workaround. |
| [WWV #385](https://github.com/silvertakana/worldwideview/issues/385) | `crypto.randomUUID()` could be unavailable on an insecure LAN origin and prevent globe session creation. | **Upstream** | Upstream [`ed452630`](https://github.com/silvertakana/worldwideview/commit/ed452630) supplies the safe UUID fallback. The old fork patch [`3af1c6e9`](https://github.com/alexl83/worldwideview/commit/3af1c6e9) is no longer applied. |
| [WWV #386](https://github.com/silvertakana/worldwideview/issues/386) | Google Maps key verification required the unavailable Places API Legacy instead of testing the Map Tiles capability WWV actually uses. | **Fork** | Map Tiles verification and Places API New support are retained in [`e7985f58`](https://github.com/alexl83/worldwideview/commit/e7985f58). Historical commits: [`0b447232`](https://github.com/alexl83/worldwideview/commit/0b447232), [`1951b2ba`](https://github.com/alexl83/worldwideview/commit/1951b2ba). |
| [WWV #387](https://github.com/silvertakana/worldwideview/issues/387) | Server-side MCP queries ignored the configured data-engine URL and forced localhost. | **Upstream** | Upstream family fix [`72a8c715`](https://github.com/silvertakana/worldwideview/commit/72a8c715) standardizes `WWV_DATA_ENGINE_URL`. The Compose deployment exposes that name and retains the old name only for rollback compatibility. |
| [WWV #388](https://github.com/silvertakana/worldwideview/issues/388) | Indexed-map and nested snapshot shapes reached array-only code and crashed on `.reduce`. | **Upstream** | Snapshot normalization is supplied by upstream [`72a8c715`](https://github.com/silvertakana/worldwideview/commit/72a8c715); historical fork patch [`0022319e`](https://github.com/alexl83/worldwideview/commit/0022319e) is no longer applied. |
| [WWV #389](https://github.com/silvertakana/worldwideview/issues/389) | Dockerfile layer ordering invalidated the expensive dependency/standalone copy on application-only changes. | **Fork** | Incremental ARM64-friendly layer ordering remains in [`e7985f58`](https://github.com/alexl83/worldwideview/commit/e7985f58). Historical implementation: [`70dfc50f`](https://github.com/alexl83/worldwideview/commit/70dfc50f). |
| [WWV #390](https://github.com/silvertakana/worldwideview/issues/390) | Cached root app shells could keep an obsolete command-bus client alive after deployment. | **Fork** | No-cache app-shell behavior and build identity remain in [`e7985f58`](https://github.com/alexl83/worldwideview/commit/e7985f58). Historical implementation: [`4f9a7ae1`](https://github.com/alexl83/worldwideview/commit/4f9a7ae1). |
| [WWV #396](https://github.com/silvertakana/worldwideview/issues/396) | A fixed 500 ms local-engine probe permanently cached transient failure and silently routed plugins to cloud endpoints. | **Upstream** | Engine discovery and URL preservation are supplied by upstream [`72a8c715`](https://github.com/silvertakana/worldwideview/commit/72a8c715). Historical fork patches [`2ce24c60`](https://github.com/alexl83/worldwideview/commit/2ce24c60) and [`4388cf78`](https://github.com/alexl83/worldwideview/commit/4388cf78) are no longer applied. |
| [WWV #398](https://github.com/silvertakana/worldwideview/issues/398) | Visible Cesium entities could be unselectable when native scene picking returned no tagged WWV primitive. | **Upstream** | Entity selection is supplied by upstream [`6a6f5403`](https://github.com/silvertakana/worldwideview/commit/6a6f5403). Historical fork patches [`6a22192e`](https://github.com/alexl83/worldwideview/commit/6a22192e) and [`5f8059f9`](https://github.com/alexl83/worldwideview/commit/5f8059f9) are no longer applied. |
| [WWV #409](https://github.com/silvertakana/worldwideview/issues/409) | Disabled plugins were re-imported during bootstrap. | **Upstream** | Upstream [`5eab6129`](https://github.com/silvertakana/worldwideview/commit/5eab6129) excludes disabled plugins during bootstrap. The old fork bootstrap patch [`1fbe8a6c`](https://github.com/alexl83/worldwideview/commit/1fbe8a6c) is no longer applied; upstream's current marketplace status and enable/disable routes provide the deployed persistence behavior. |
| [WWV #417](https://github.com/silvertakana/worldwideview/issues/417) | A terminally closed globe-command SSE connection left an open browser or headless session uncontrollable until refresh. | **Upstream** | Bounded command-stream reconnection is supplied by upstream [`65954cdc`](https://github.com/silvertakana/worldwideview/commit/65954cdc). Historical fork commit [`7793a928`](https://github.com/alexl83/worldwideview/commit/7793a928) is the pre-integration implementation and rollback point, not an active patch. |

The remaining WWV fork extensions used by this deployment are not presented as
upstream bugs:

- [`e7985f58`](https://github.com/alexl83/worldwideview/commit/e7985f58):
  session-pinned, authenticated frontend agent chat over the control room's
  local Unix-socket relay, including server-side MCP session pinning. Historical
  implementation: [`0844ef52`](https://github.com/alexl83/worldwideview/commit/0844ef52).

## WWV data engine

| Issue | Observed defect | Status | Deployed source |
|---|---|---|---|
| [wwv-data-engine #24](https://github.com/silvertakana/wwv-data-engine/issues/24) | The manifest exposed seeder directory names such as `civilUnrest` and `gpsjam`, while retained snapshots used canonical IDs such as `civil-unrest` and `gps-jamming`. | **Control Room** | The deployed engine enumerates retained `data:*:live` keys and merges their canonical IDs into the manifest. The proposed implementation remains attached to the upstream issue. |
| [wwv-data-engine #25](https://github.com/silvertakana/wwv-data-engine/issues/25) | Stock self-hosting lacked `/api/aviation`, although the verified Aviation frontend requires it. | **Control Room** | [`b2419dd`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/b2419dd) adds the initial OpenSky adapter; [`63591e7`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/63591e7) adds OAuth, quota-aware polling and last-good snapshots; [`1630fef`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/1630fef) provisions it reproducibly. |

The control room also supplies a same-origin Aviation frontend wrapper and HTTPS
compatibility proxy in [`022c907`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/022c907)
and [`de09205`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/de09205).
These solve deployment compatibility around the upstream feed; they do not turn
military aviation into a civilian-feed alias.

## WWV seeders

| Issue | Observed defect | Status | Deployed source |
|---|---|---|---|
| [wwv-seeders #10](https://github.com/silvertakana/wwv-seeders/issues/10) | `conflictEvents` converted broad GKG keyword/location mentions into incidents, generated random casualties, omitted source URLs and changed IDs every run. | **Control Room** | [`63591e7`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/63591e7) replaces it with sourced GDELT Event Database 2.0 records, stable `GLOBALEVENTID` identifiers and no invented fatalities; [`1630fef`](https://github.com/alexl83/worldwideview-rpi-control-room/commit/1630fef) provisions the audited replacement. |

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

Build the application from the tagged integrated fork rather than replaying the
historical patches individually. On a future upstream update, compare the new
baseline with the rows marked **Fork**, retain only the still-needed changes,
and never reapply rows marked **Upstream** or **Retired**. Rows marked
**Control Room** are provisioned by this repository independently of the WWV
application image.
