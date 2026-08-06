# wwv-agent

Minimal WhatsApp Web relay for Codex and WorldwideView. It has no TCP listener,
dashboard, generic plugin runtime, or privileged execution path. Its authenticated
frontend transport is HTTP over a local Unix socket only.

The relay starts Codex in `read-only` mode, preserves one native Codex thread per
allowed WhatsApp direct chat, rejects groups and unknown senders, and relies on
the WorldwideView MCP entry in the service user's Codex configuration. WhatsApp
turns are always pinned to the stable headless globe through Caddy's loopback MCP
alias; they never select or control an operator's interactive tab.

Telephone-number authorization and opaque WhatsApp identity authorization are
kept separate. `WWV_AGENT_ALLOWED_NUMBERS` contains E.164 phone numbers and is
also the source for default monitor recipients. `WWV_AGENT_ALLOWED_IDENTITIES`
contains exceptional LIDs used only to accept inbound messages when Baileys does
not provide a phone-number alias; LIDs are never notification destinations.

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

User-visible relay messages can carry a configurable WhatsApp disappearing-message
expiration. Set `WWV_AGENT_EPHEMERAL_EXPIRATION_SECONDS` to the desired lifetime
in seconds (`0` disables it). This covers interactive text, voice responses and
monitor alerts, while reactions and protocol messages remain untouched. Baileys
does not maintain a persistent chat store in this relay, so changing the timer in
the official WhatsApp client does not automatically update this environment
variable; operators must keep the two settings aligned and restart `wwv-agent`.

Baileys message retries are fully supported. Every outbound protobuf payload is
kept for seven days (maximum 1,000 messages) in
`/var/lib/wwv-agent/whatsapp-outbound-messages.json`; `getMessage` serves it when
WhatsApp asks the linked device to retransmit a message that another device could
not decrypt. A process-wide retry counter limits attempts to five, and a socket
generation guard prevents overlapping reconnect loops. The cache is mode `0600`
and contains message content, so treat it with the same sensitivity as WhatsApp
linked-device state.

Retry lookup is independent of the recipient identifier representation. It first
matches the exact JID and message ID, then falls back to the stable message ID so
that a retry arriving through WhatsApp's LID alias can recover a payload originally
cached under a phone-number JID. LID values are opaque account identifiers: never
hard-code or commit identifiers observed in production. Automated tests use only
synthetic JIDs and LIDs; replacing those values does not change retry behaviour.

Commands sent through WhatsApp: `/help`, `/status`, `/new`, `/monitors`,
`/monitor list`, `/monitor show <id>`, `/monitor create`,
`/monitor confirm <code>`, `/monitor cancel [code]`,
`/monitor enable|disable <id>`, `/monitor brief <id>`, and `/brief <id>`.

- `/new` drops only that sender's saved Codex thread.
- `/status` reports relay, headless globe, sandbox, voice and monitor status.
- `/brief <id>` evaluates current snapshots without notifying or marking events.
- `/monitor <id> pause` is accepted as an alias for `off`.
- `/monitor create` starts an administrator-only guided workflow. Its pending
  steps and confirmation expire after ten minutes. The compact equivalent is
  `/monitor create "Name" "Place" 10km earthquakes,wildfire` (a pipe-delimited
  `Name | Place | 10km | layers` form is also accepted).
- Creation geocodes the supplied place through the configured Nominatim endpoint,
  displays the resolved location and complete monitor preview, and writes
  nothing until `/monitor confirm <code>` is received from the same chat.
- Confirmed monitors are atomically stored in the private
  `/var/lib/wwv-agent/managed-monitors.json` overlay. The root-managed
  `/etc/wwv-monitors.json` remains read-only. New monitors begin with a silent
  baseline and use conservative five-minute polling, seven-day deduplication
  retention and a thirty-minute notification cooldown.
- Only identities listed by `WWV_AGENT_ADMIN_NUMBERS` or
  `WWV_AGENT_ADMIN_IDENTITIES` can create and confirm monitors. Listing,
  inspection, brief and the legacy enable/disable controls remain available to
  other allow-listed operators.

## TODO

- [ ] Add secure self-service enrollment for a new WhatsApp identity. An
  administrator should generate a single-use code with a short expiration; the
  new contact sends `/pair <code>`, and the relay atomically consumes the code
  and stores the observed LID as an authorized inbound identity. The workflow
  must rate-limit attempts, avoid logging the code, keep phone numbers and LIDs
  out of the repository, and must not add a LID to monitor recipients.
- [ ] **Optional:** add full WhatsApp group support. Keep group JIDs in a
  dedicated private allow-list and enroll groups through a short-lived,
  single-use administrator code. Define per-group member/LID authorization,
  require an explicit mention or reply by default, support configurable shared
  versus per-member Codex threads, serialize globe-control requests, quote the
  triggering message, and preserve voice, disappearing-message and retry
  behavior. Monitor notifications must use typed phone/group targets so neither
  a participant LID nor mere group membership can grant control or become an
  alert destination. Administrative commands must remain restricted to
  explicitly authorized operators.
