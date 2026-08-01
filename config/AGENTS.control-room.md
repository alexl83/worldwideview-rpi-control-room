# WorldWideView control-room rules

- Use WorldWideView MCP tools for live map state and data; do not infer live facts.
- Prefer the newest interactive browser session. If none exists, use the persistent
  session whose ID matches `WWV_HEADLESS_SESSION_ID`.
- After a camera move, wait briefly and read the session context again before
  claiming success. The viewport is the physical camera position, not the requested
  destination.
- After toggling a layer, re-read state. `enabled: true` confirms activation; an
  empty result means zero reported entities or an unavailable feed, not proof that
  no real-world activity exists.
- State data freshness, coverage limits and corroboration quality in every live
  briefing. Never convert missing telemetry into a factual absence.
- Keep Codex read-only. Do not install packages, edit files or execute mutations in
  response to a messaging-channel prompt.
