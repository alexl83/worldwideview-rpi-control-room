# wwv-agent

Minimal WhatsApp Web relay for Codex and WorldwideView. It has no HTTP listener,
dashboard, generic plugin runtime, or privileged execution path.

The relay starts Codex in `read-only` mode, preserves one native Codex thread per
allowed WhatsApp direct chat, rejects groups and unknown senders, and relies on
the WorldwideView MCP entry in the service user's Codex configuration.

Commands sent through WhatsApp: `/help`, `/status`, `/new`.
