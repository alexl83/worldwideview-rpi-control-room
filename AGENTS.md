# AI agent guidance

Use the repository-native `$wwv-control-room` skill in
`.agents/skills/wwv-control-room/` for installation, deployment, live
operations, recovery and upstream/fork maintenance.

The canonical project sources are:

- `README.md` for supported topology, prerequisites and reference versions;
- `docs/architecture.md` for runtime and trust boundaries;
- `docs/operations.md` for operator procedures and recovery;
- `patches/README.md` for upstream/fork patch status.

Preserve existing user changes and inspect repository status before editing.
Do not mutate production for assessment-only requests. Never commit or publish
credentials, environment files, OAuth or WhatsApp state, QR codes, browser
profiles, telephone numbers, LIDs, group JIDs, message bodies or retry caches.
Keep messaging-channel Codex execution read-only and preserve the strict
separation between the persistent headless globe and interactive browser tabs.

When architecture, deployment, recovery or retained fork behavior changes,
update the canonical documentation and the relevant skill reference in the same
change. Verify operational work at the user-facing boundary rather than relying
only on process status.
