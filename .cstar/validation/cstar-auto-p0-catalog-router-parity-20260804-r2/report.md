# SET-04 independent validation report

- Validation id: `validation:cstar-auto-p0-catalog-router-parity-20260804-r2`
- Bead: `bead:mcp:after-mechanism-closure-make-the-default-capabil-msf54o97`
- Worktree: `/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803`
- Verdict: `ACCEPTED`
- Requested validator model: `gpt-5.6-luna/max`
- Actual validator identity: `unreported` (the host exposed no enforceable actual-model identity)

## Result

SET-04 is accepted for source, checked-in distribution, registry/catalog, router,
documentation, and bounded structural validation. The post-generator lineage
repair is now proven: the distribution validator reports eight synchronized
artifacts, the distribution test suite passes 7/7, the lineage capability hash
matches the current generated registry projection, and every plugin byte named
by lineage matches its declared SHA-256 and byte count.

This is source and receipt acceptance only. It makes no runtime activation,
provider-readiness, deployment, or production claim. No restart or reload was
performed, as required by the operator boundary.

## Counts

| Check | Result |
| --- | ---: |
| SET-04 catalog/surface/compatibility tests | 26/26, 3 suites |
| Registry/router/documentation Python contracts | 49/49 |
| Registry/catalog contracts excluding materialization | 14/14, 3 suites |
| Distribution manifest tests | 7/7, 1 suite |
| Generated distribution artifacts | 8/8 synchronized |
| Typecheck | pass, exit 0 |
| `git diff --check` | pass, exit 0 |
| SET-04 changed production/test source maximum | 440 lines |

The exact bounded commands and probe results are in
`focused-check.json`, `distribution-check.json`, and `structural-check.json` in
this receipt directory.

## Verified behavior

- The registry contains four entries: `corvus-forge`, `researcher`, and
  `cstar-closeout` are the three default operator entries; `calculus` remains
  compatibility-only and is still discoverable by exact lookup.
- The public catalog has 28 unique tools and includes
  `cstar_forge_authorize`.
- Active Forge descriptions use the exact lifecycle phrase
  `request -> authorize -> execute -> independent record_result` in the skill,
  registry, architecture registry, and host-native contract surfaces.
- The compact active router contains no retired One Mind, Weave, HostGovernor,
  or AutoBot route terms. Historical references in explicit archival material
  were not treated as active routing.
- The Codex-host Luna handoff is documented as documentation-only, with
  requested and actual identity separate and no runtime activation or provider
  readiness claim.
- The SET-04 source/test line audit covers exactly:
  `src/node/core/commands/capability_discovery.ts` (440),
  `tests/unit/cstar-kernel-mcp/test_tool_catalog.test.ts` (168), and
  `tests/unit/cstar-kernel-mcp/test_capability_compatibility_discovery.test.ts`
  (107). All are at or below the 500-line limit.

## Bounded artifact evidence

The changed SET-04 source, documentation, tests, generated lineage, and this
report are listed with SHA-256 and byte counts in `manifest.json`. The current
registry hash is
`bd6c1bd3b86f882257f1bb4e4e6a2b5f1eac547cb84904c7be5bc92db9137cc3`; the
generated lineage is
`5ad42f79fb0cc6109c5a49fa3c6237710a76ad67d5b0698382cc8284a2c101c8`.

The worktree remains dirty outside this bounded SET-04 receipt. Those unrelated
changes were preserved. This validator made no source/test edit and performed
no CStar call, provider attempt, restart/reload, Git mutation, install,
deployment, configuration/secret mutation, or write outside the requested
receipt directory (apart from correcting one immediately removed receipt-path
typo during receipt construction).
