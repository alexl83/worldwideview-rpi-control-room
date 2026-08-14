# Changelog

All notable changes to the WorldWideView Raspberry Pi Control Room are documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The project does not yet publish numbered releases, so entries are grouped by the
date on which each operational milestone reached `main`.

## [Unreleased]

### Fixed

- Resolve phone-number monitor recipients through Baileys' persisted PN→LID
  mapping before delivery. Configuration and authorization continue to use stable
  phone numbers, while proactive alerts use the recipient's current cryptographic
  address and avoid cross-JID retry placeholders. Administrative text resends use
  the same resolution path.

### Planned

- Stable enrollment of third-party WhatsApp users, binding an observed LID to an
  administrator-approved phone number without making LIDs notification targets.
- Optional richer WhatsApp group support where it can preserve the existing
  group-scoped authorization model.

## [2026-08-14] - LID-aware WhatsApp delivery

### Changed

- Migrated the relay from Baileys 6.7.18 to pinned Baileys 7.0.0-rc14, adding the
  PN/LID mappings and device-list state required by current WhatsApp companion
  devices.
- Delayed administrative cached-message resends until initial synchronization
  and LID session creation are complete.
- Documented recoverable backups and the prohibition on in-place downgrades of a
  migrated WhatsApp authentication state.

### Fixed

- Fixed repeated “Waiting for this message” placeholders, exhausted retry loops
  and Signal-session churn on LID-migrated direct chats.
- Improved resend error logging so protocol and malformed-request failures retain
  their diagnostic stack.

### Security

- Removed the obsolete Baileys 6.7.18 dependency, which predates the upstream
  fix for message/history spoofing and app-state corruption.

## [2026-08-07] - WhatsApp groups and durable control sessions

### Added

- Added monitor creation, confirmation, cancellation, inspection and lifecycle
  control from authorized WhatsApp direct chats.
- Added securely enrolled, passive WhatsApp groups as typed alert destinations.
- Added group-scoped monitor assignment, enable/disable, creation and manual
  briefs. Ordinary group members can list and brief only active monitors assigned
  to that group; live WWV queries remain disabled in groups.
- Added a two-part group authorization rule: the sender must be both a current
  WhatsApp group administrator and present in the relay operator allow-list.

### Changed

- Separated phone-number recipients from opaque LID identities. LIDs authorize
  observed inbound senders but are never converted into alert destinations.
- Kept the frontend agent Unix socket persistent across container restarts.
- Recorded the WWV command-stream reconnection patch used to preserve control of
  already-open browser and headless sessions after service restarts.

## [2026-08-05] - Disappearing messages

### Added

- Added configurable WhatsApp disappearing-message expiration for interactive
  text, monitor alerts and voice replies.
- Documented that Baileys does not inherit timer changes made in the official
  WhatsApp client; operators must align the relay environment explicitly.

## [2026-08-03] - Multi-device message recovery

### Added

- Added a persistent, permission-restricted seven-day cache of outbound protobuf
  payloads for WhatsApp retransmission requests.
- Added safe one-shot text resend and lookup across phone-number and LID forms of
  the same stable message ID.
- Added offline backup guidance for WhatsApp credentials, Signal keys and cached
  message content.

### Fixed

- Fixed companion-device retry requests that arrived using a different JID form
  from the original outbound message.

## [2026-08-02] - Secure remote operation and reliable data feeds

### Added

- Added fully local Italian voice-note transcription and speech synthesis. Voice
  requests receive both the complete text answer and a voice response.
- Added a Caddy HTTPS gateway with a private local CA, loopback-only service
  binds, LAN and ZeroTier DNS names, and compatibility routes for legacy plugins.
- Added a persistent headless Chromium globe so WhatsApp can control WWV without
  an operator computer or browser being online.
- Added self-hosted civilian aviation ingestion through OpenSky, with anonymous
  conservative polling and optional OAuth client credentials.

### Changed

- Replaced the unsafe legacy GDELT path with sourced Event 2.0 ingestion, stable
  fingerprints, CAMEO classification and non-alerting defaults for unverified
  machine-coded reports.
- Pinned WhatsApp Codex turns to the headless WWV session and kept interactive
  frontend turns pinned to their originating browser tab.
- Relicensed the control room from MIT to GPL-3.0-or-later; previously published
  versions retain their original grants.

### Fixed

- Added same-origin engine and Aviation compatibility routes to avoid mixed
  content, incorrect cloud fallback and legacy 404 responses under HTTPS.
- Rejected synthetic or unverifiable casualty alerts and consolidated conflicting
  duplicate reports instead of summing them.

## [2026-08-01] - Initial control-room release

### Added

- Published the reproducible Raspberry Pi 5 control-room pipeline: WWV, local
  data engine, PostgreSQL, Redis, Codex CLI relay and systemd services.
- Added Mac-to-Raspberry Pi ARM64 cross-build and incremental deployment through
  a temporary registry and SSH reverse tunnel, with automatic rollback.
- Added deterministic geofenced monitoring with configurable centers, radii,
  layers, intervals, thresholds, recipients and cooldowns.
- Added silent baseline establishment, stable event deduplication, serialized
  state persistence and concise Codex-generated WhatsApp briefings.
- Added authenticated local-agent chat to the WWV frontend, bound to the browser
  session that initiated the request.

[Unreleased]: https://github.com/alexl83/worldwideview-rpi-control-room/compare/main...HEAD
[2026-08-14]: https://github.com/alexl83/worldwideview-rpi-control-room/commits/main/?since=2026-08-14T00:00:00Z&until=2026-08-14T23:59:59Z
[2026-08-07]: https://github.com/alexl83/worldwideview-rpi-control-room/commits/main/?since=2026-08-07T00:00:00Z&until=2026-08-07T23:59:59Z
[2026-08-05]: https://github.com/alexl83/worldwideview-rpi-control-room/commits/main/?since=2026-08-05T00:00:00Z&until=2026-08-05T23:59:59Z
[2026-08-03]: https://github.com/alexl83/worldwideview-rpi-control-room/commits/main/?since=2026-08-03T00:00:00Z&until=2026-08-03T23:59:59Z
[2026-08-02]: https://github.com/alexl83/worldwideview-rpi-control-room/commits/main/?since=2026-08-02T00:00:00Z&until=2026-08-02T23:59:59Z
[2026-08-01]: https://github.com/alexl83/worldwideview-rpi-control-room/commits/main/?since=2026-08-01T00:00:00Z&until=2026-08-01T23:59:59Z
