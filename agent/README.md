# wwv-agent

Minimal WhatsApp Web relay for Codex and WorldwideView. It has no HTTP listener,
dashboard, generic plugin runtime, or privileged execution path.

The relay starts Codex in `read-only` mode, preserves one native Codex thread per
allowed WhatsApp direct chat, rejects groups and unknown senders, and relies on
the WorldwideView MCP entry in the service user's Codex configuration.

The integrated monitor polls engine snapshots without invoking an LLM, establishes
a silent first-run baseline, filters events by geodesic radius, deduplicates them,
and invokes Codex only for a triggered alert. The single relay socket sends both
interactive responses and automatic notifications.

Commands sent through WhatsApp: `/help`, `/status`, `/new`, `/monitors`,
`/monitor <id> on|off`, and `/brief <id>`.
