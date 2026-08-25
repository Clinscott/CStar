# SET-04 independent validation report

- Validation id: `validation:cstar-auto-p0-catalog-router-parity-20260804-r1`
- Bead: `bead:mcp:after-mechanism-closure-make-the-default-capabil-msf54o97`
- Worktree: `/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803`
- Requested validator: `gpt-5.6-luna/max`
- Actual validator identity: `unreported`
- Verdict: `REJECTED`

## Evidence that passed

The mandated SET-04 focused command passed 26/26 tests in 3 suites. It proves the
default operator manifest excludes the compatibility-only calculus entry while
exact skill lookup retains it, the public catalog has 28 unique tools including
`cstar_forge_authorize`, and the active router surfaces retain the supported
compatibility boundary.

The bounded Python registry/router/documentation contracts passed 49/49 tests.
The non-materialization registry/catalog contracts passed 14/14 tests. The
active Forge descriptions inspected in `.agents/skills/corvus-forge/SKILL.md`,
`.agents/skill_registry.json`, `docs/architecture/SKILL_REGISTRY.md`, and
`docs/integrations/host_native_skill_contract.md` all contain the exact
`request -> authorize -> execute -> independent record_result` phrase. The
active AGENTS router is compact, truthful about CoS/CStar/Forge/Researcher and
independent validation roles, and contains no active One Mind or Weave route.
The Codex-host Luna handoff is explicitly documentation-only, separates
requested from actual identity, and makes no runtime activation or provider
readiness claim. No robot-language operator prompt is required by the checked
active surfaces.

`npm run typecheck` passed with exit 0. `git diff --check` passed with exit 0.
The three touched production/test source files are 440, 168, and 107 lines;
the maximum is 440, below the hard 500-line limit. The unrelated dirty paths
were preserved.

## Blocking failure

The existing checked-in distribution materialization contract ran 7 tests and
reported 6 passed, 1 failed:

`validateDistributions(process.cwd())` returned
`plugins/corvus-star/lineage.json: stale`.

The SET-04 registry is changed to SHA-256
`bd6c1bd3b86f882257f1bb4e4e6a2b5f1eac547cb84904c7be5bc92db9137cc3`, while
the checked-in lineage remains SHA-256
`aa8676f8c9d87f2f9753755c62685d3fc205cce73546c77c38aad2807536e7c2` and is
unchanged in the worktree. The package validator therefore detects source /
materialization drift. This is a closure blocker because the SET-04 change
alters the registry consumed by the distribution builder while the checked-in
lineage remains stale.

Required repair: regenerate the checked-in distribution materialization from
the final `.agents/skill_registry.json` using the repository generator, then
rerun this exact independent validation. This validator did not perform that
repair, did not edit source or tests, and did not claim runtime activation.

No CStar lifecycle call, provider attempt, restart/reload, Git operation,
install, deploy, configuration/secret mutation, or write outside the specified
receipt directory occurred. The five receipt files in this directory are the
only validator outputs.
