# Upstream and fork maintenance

Use this reference when assessing new WWV work, updating the public fork,
preparing a release or deciding whether a downstream patch remains necessary.
Read [`patches/README.md`](../../../../patches/README.md) in full first.

## Assessment-only requests

Do not fetch into, edit, merge, rebase, build, tag or deploy merely to answer an
assessment request. Use read-only Git/GitHub queries to compare:

- deployed/tagged fork commit and current production image;
- fork branch and upstream merge base;
- commits already merged upstream;
- open PRs that may make an immediate integration obsolete;
- changed paths that overlap retained control-room customizations.

Report concrete benefits, breaking changes, conflict areas and a recommendation.

## Integration preparation

1. Require a clean worktree or explicitly preserve every pre-existing change.
   Do not commit formatter-only or generated noise just to make the tree clean.
2. Create verified rollback tags for both the WWV fork and control-room repository
   before changing the integration baseline.
3. Work on an integration branch. Do not rewrite the published rollback point.
4. Classify every patch-ledger row:
   - **Upstream:** use the upstream implementation; never replay the historical
     downstream commit.
   - **Retired:** do not reintroduce it.
   - **Fork:** test whether upstream now supersedes it; retain only the missing
     behavior.
   - **Control Room:** keep it in this repository unless the architecture has
     deliberately changed.
5. Preserve deployment-specific behavior still required by the control room:
   authenticated session-pinned frontend chat, strict interactive/headless
   separation, the loopback MCP alias, reproducible seeders/compatibility routes,
   restricted-key handling, no-cache/deploy behavior and incremental ARM64
   rollback deployment where upstream does not supply equivalents.

## Verification before deployment

- Resolve conflicts semantically, especially in MCP routes, `AppShell`, Places,
  plugin discovery, Dockerfiles, `next.config` and package metadata.
- Run the upstream unit/type/build suites plus control-room-specific tests.
- Cross-build ARM64 on the faster host and validate the image independently.
- Test frontend chat against its originating browser session and WhatsApp against
  only the headless session.
- Exercise populated and empty feeds, plugin disable/enable persistence, Places,
  Aviation, camera confirmation, monitor queries and rollback.
- Update the fork release/tag, patch ledger, README reference version and control
  room changelog only after the tested source is the source being documented.

Never publish an upstream issue or pull request without explicit user authority.
When authorized, remove deployment secrets and personal identifiers, link a
minimal focused commit, and distinguish an upstream defect from local policy or
orchestration behavior.
