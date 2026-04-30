# Pass B — Follow-up TODOs

Logged during Pass A execution. These are call sites or files that still
reference the archived `.agents/skills`, `.agents/weaves`, `.agents/spells`,
or `.agents/workflows` paths but did NOT block Pass A. They will fault at
runtime if exercised — that is expected and gets cleaned up in Pass B.

## Live runtime referencing archived paths

- `src/node/core/state.ts:191` — descriptive string `'.agents/skills/*.feature (Behavioral Contracts)'` in a contracts manifest. Will resolve to a non-existent path; no longer authoritative.
- `src/node/core/runtime/bootstrap.ts:80` — reads `.agents/skill_registry.json`. Registry remains in place but `entries` is now empty. No fault, but downstream iteration is a no-op.
- `src/node/core/runtime/entry_surface.ts:29,31` — registry path resolution. Same as bootstrap.
- `src/node/core/runtime/dispatcher.ts:42` — registry path. Same.
- `src/node/core/runtime/host_workflows/chant_parser.ts:161` — registry path. Same.
- `src/node/core/runtime/adapters/legacy_commands.ts:25` — registry path; legacy adapter, archive in Pass B.
- `src/node/core/commands/capability_discovery.ts:327-329,382` — generates `.agents/weaves/<id>.md`, `.agents/spells/<id>.md`, `.agents/skills/<id>/SKILL.md` paths. Returns will not exist on disk; downstream reads will fail.
- `src/node/core/commands/python.ts:76,102` — `.agents/skills/taliesin/scripts/{taliesin_main,recreate_chapter}.py`. Taliesin scripts are now under `mind_archive/skills/taliesin/`. Either rewire path or archive command.
- `src/core/host_session.ts:337` — registry path. Same as bootstrap.
- `src/packaging/distributions.ts:100,286,363,387` — packages registry into release bundles. Bundles will ship an empty registry; consumers must tolerate it.
- `src/tools/pennyone/{live/search.ts,intel/{session_manager.ts,bead_controller.ts,repository_manager.ts}}` — guards against indexing the registry (still wanted; registry path unchanged).

## Tests assuming `.agents/skills`

- `tests/quarantine/test_hall_schema.test.ts` (already quarantined)
- `tests/quarantine/test_tui_runtime.test.ts` (already quarantined)
- `tests/quarantine/test_agent_browser.test.ts`
- `tests/quarantine/test_evolve_runtime.test.ts`
- `tests/quarantine/test_chant_host_native_dispatch.test.ts`
- `tests/quarantine/test_pennyone_projection_gate.test.ts`
- `tests/quarantine/test_capability_discovery.test.ts`
- `tests/unit/test_release_bundles.test.ts`
- `tests/unit/test_host_session_runtime.test.ts`
- `tests/unit/test_state_registry_projection.test.ts`
- `tests/unit/test_distribution_manifests.test.ts`
- `tests/unit/test_runtime_dispatch.test.ts`
- `tests/unit/test_runtime_command_invocations.test.ts`

## Documentation referencing archived paths

- `docs/HANDOFF.md:28,32` — describes weave/spell layout pre-archive.
- `docs/dev_journal.qmd:569` — narrative of the workflow extension strategy.
- `docs/integrations/cstar_capability_discovery_api.md:61-62` — API doc for weave/spell discovery.

## TypeScript errors uncovered during Pass A re-execution (2026-04-30)

`tsc --noEmit` reports 11 errors in non-kernel paths. These are pre-existing
(not regressions from Pass A) but block a clean `npm run test:node`:

- `src/core/host_intelligence.ts:233,286,300,313` — `AuguryLearningMetadata` index signature, `transport_mode` property missing.
- `src/node/core/runtime/host_workflows/chant_planner.ts:201,206,319` — `ArchitectProposal` / `ArchitectProposalBead` symbols missing.
- `src/node/core/runtime/host_workflows/critique.ts:334` — `hostBridge` symbol missing.
- `src/node/core/runtime/weaves/host_bridge.ts:45` — `RuntimeAuguryContract` cast.
- `src/node/core/runtime/worker_bridge.ts:5` — missing module `../kernel_root.js`.
- `src/tools/cstar-kernel-mcp.ts:506` — `signature_question` does not exist on `CouncilExpertProtocol`.

The last item is inside the kernel itself but doesn't prevent runtime startup
(handlers tested 9/9 pass). All six should be addressed during Pass B B-3 / B-5
when the trace/council types are reorganized.

## Root `cstar.ts` retention

`cstar.ts` (root, 22KB) was kept in Pass A despite the audit's Phase 9 step 4 —
live consumers prevent deletion:

- `bin/cstar.js:19` — `ENTRY_POINT = join(PROJECT_ROOT, 'cstar.ts')`.
- `package.json` `main`, `install-os`, `uninstall-os` scripts.

Address during Pass B B-6 (CLI surface trim).

## Pass B refactor reminders (from CLAUDE_AUDIT_CSTAR.md §Pass B)

- B-1: Rename `src/tools/pennyone/intel/` → `src/kernel/hall/`.
- B-2: Rename `src/tools/pennyone/pathRegistry.ts` → `src/kernel/path_registry.ts`.
- B-3: Move `src/core/council_experts.ts` → `src/kernel/augury/council_experts.ts`.
- B-4: Move `src/tools/cstar-kernel-mcp.ts` → `src/kernel/mcp.ts`.
- B-5: Split `src/node/core/commands/trace.ts` (1763 lines) into `src/kernel/state.ts` + a CLI renderer in `mind_archive/cli_renderers/trace_cli.ts`.
- B-6: Trim the `./cstar` Commander surface (most subcommands target archived skills/weaves and will fault).
- B-7: Cleanup `src/tools/pennyone/` non-DB content after B-1.
