# wwv-agent

Minimal WhatsApp Web relay for Codex and WorldwideView. It has no TCP listener,
dashboard, generic plugin runtime, or privileged execution path. Its authenticated
frontend transport is HTTP over a local Unix socket only.

The relay starts Codex in `read-only` mode, preserves one native Codex thread per
allowed WhatsApp direct chat, rejects groups and unknown senders, and relies on
the WorldwideView MCP entry in the service user's Codex configuration. WhatsApp
turns are always pinned to the stable headless globe through Caddy's loopback MCP
alias; they never select or control an operator's interactive tab.

The integrated monitor polls engine snapshots without invoking an LLM, establishes
a silent first-run baseline, filters events by geodesic radius, deduplicates them,
and invokes Codex only for a triggered alert. The single relay socket sends both
interactive responses and automatic notifications.

Monitor normalization supports array and indexed-map snapshots, latitude/longitude
aliases, great-circle radii, stable URL fingerprints, volatile collector-ID
deduplication, duplicate casualty ranges and atomic serialized state writes.
The local conflict seeder consumes GDELT Event 2.0 instead of GKG keyword
mentions, preserves stable event IDs and source URLs, and never supplies invented
casualty counts. Its machine-coded reports remain visible to analysis but do not
trigger automatic alerts unless `includeUnverifiedMentions` is explicitly set.

Authenticated WWV frontend chat reaches the relay over a Unix socket. Its Codex
thread key includes both authenticated user ID and tab session UUID, and every
MCP turn remains bound to that tab. The frontend route is text-only in the current
implementation.

WhatsApp voice notes are decoded and transcribed locally with Whisper. The relay
sends the transcript, always sends the full text answer, and then synthesizes an
Italian Opus reply with Piper. Written prompts never produce unsolicited audio.

Baileys message retries are fully supported. Every outbound protobuf payload is
kept for seven days (maximum 1,000 messages) in
`/var/lib/wwv-agent/whatsapp-outbound-messages.json`; `getMessage` serves it when
WhatsApp asks the linked device to retransmit a message that another device could
not decrypt. A process-wide retry counter limits attempts to five, and a socket
generation guard prevents overlapping reconnect loops. The cache is mode `0600`
and contains message content, so treat it with the same sensitivity as WhatsApp
linked-device state.

Commands sent through WhatsApp: `/help`, `/status`, `/new`, `/monitors`,
`/monitor <id> on|off`, and `/brief <id>`.

- `/new` drops only that sender's saved Codex thread.
- `/status` reports relay, headless globe, sandbox, voice and monitor status.
- `/brief <id>` evaluates current snapshots without notifying or marking events.
- `/monitor <id> pause` is accepted as an alias for `off`.
