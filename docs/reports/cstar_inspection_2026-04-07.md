# CStar Inspection Report - 2026-04-07

## Scope

This report records what the current CStar worktree shows before any new explanation of the Gemini attempt. It is based on:

- Hall query: `Level 5 diagnostic CStar refactor compile AutoBot SovereignWorker chant host timeout PennyOne graphology`
- Git diff/status of `/home/morderith/Corvus/CStar`
- Level 5 Diagnostic after hardening
- Verification gates run after recovery edits

## Executive Summary

CStar has undergone a broad refactor across runtime dispatch, host-provider routing, PennyOne scanning, War Room state, AutoBot/SovereignWorker surfaces, and diagnostic tooling.

The refactor intent appears to be:

- Move more behavior into host-native/sub-agent workflows.
- Add a War Room blackboard/agent roster and TUI tabs.
- Add provider routing for a new `droid` host.
- Add browser automation as an agent-native skill.
- Add session engraving into Hall episodic memory.
- Add PennyOne semantic clustering via graphology/Louvain.
- Add orchestrator fail-fast behavior for resource pressure and blocked beads.
- Archive old `.agents/memory/session_*.json` traces.

The risky pattern is that several paths replaced explicit provider/session abstractions with hard-coded AutoBot/Hermes subprocess calls. This contradicts the Host-Native First contract unless those routes are intentionally registered as provider adapters.

## Current Health

Passing gates:

```text
npm exec tsc -- --noEmit --pretty false
node scripts/run-python.mjs -m pytest tests/unit/engine/test_sovereign_worker.py tests/autobot_extensive/unit/test_sovereign_parser.py tests/unit/test_autobot_skill.py
```

Result:

```text
TypeScript compile: PASS
Focused Python tests: 23 passed
```

Known failing or degraded surface from the first pass:

- `cstar hall` works.
- The earlier `cstar chant` timeout is now reclassified as a diagnostic miss: it exercised a stale shell/CLI surface. If chant is host-native, remaining CLI chant paths are contract drift and must be removed or explicitly deprecated.

## Level 5 Diagnostic

I hardened `.agents/skills/level-5-diagnostic` before using it:

- Made the skill contract report-only.
- Deprecated `--resolve` mutation behavior.
- Prevented hook/settings/manifest mutation.
- Fixed the CStar path handling for extension-local checks.
- Added Markdown report output.
- Verified the script with Python bytecode compilation.

Generated artifacts:

- `LEVEL_5_DIAGNOSTIC_FINDINGS.json`
- `LEVEL_5_DIAGNOSTIC_REPORT.md`

Diagnostic result:

```text
Files scanned: 449
Total findings: 252
Linscott breaches: 232
Complexity warnings: 35
Textual rot findings: 20
Integrity breaches: 0
```

Finding distribution:

```text
General Subsystems: 90
Kernel (Node.js): 57
Woven Skills: 53
Memory (PennyOne): 36
Core Engine (Python): 14
Enforcers (Wardens): 2
```

## Major Changes Observed

### Runtime And Orchestration

- `cstar.ts` gained `broadcast` and `hand` commands for War Room messaging and agent handoff.
- `src/node/core/state.ts`, `src/node/core/tui/operator_tui.ts`, and `src/node/core/blackboard_manager.ts` add agent roster, blackboard entries, terminal logs, tabbed TUI views, and blackboard compaction.
- `src/node/core/runtime/dispatcher.ts` marks agents working/sleeping during dispatch and posts dispatch events to blackboard.
- `src/node/core/runtime/weaves/orchestrate.ts` adds memory/heap pressure checks and fail-fast behavior when beads become blocked or failed.
- `src/node/core/runtime/weaves/engrave.ts` adds an Engrave weave that converts ephemeral `.agents/memory/session_*.json` files into Hall episodic memory and archives the source files.

Risk: War Room state updates are now inside dispatch paths. That increases coupling between runtime execution and UI/state projection.

### Host And Provider Routing

- `src/core/host_session.ts` adds `droid` as a `HostProvider`.
- `src/core/host_subagents.ts` adds a `droid` profile.
- `src/core/context_loader.ts` adds cascading `AGENTS.md`/`AGENTS.qmd` context loading.
- `src/core/host_intelligence.ts` injects cascading context into host text requests.

Risk: Adding `droid` widened shared provider unions; several compile failures came from call sites still assuming only `gemini | codex | claude`.

### AutoBot / SovereignWorker

- `src/core/engine/autobot_skill.py` was changed toward a configurable model surface.
- The refactor had replaced bead execution with direct `SovereignWorker` calls, bypassing command injection. I restored the tested `build_bead_command` / `run_bead_query` path.
- `src/core/engine/sovereign_worker.py` had been hard-routed to `/home/morderith/Corvus/AutoBot/scripts/autobot_orchestrator.py run_hermes`. I restored the local HTTP LLM call path because the worker unit tests and the original interface depend on it.

Risk: Some other TypeScript intelligence paths still contain direct AutoBot/Hermes subprocess fallback code.

### PennyOne / Mimir

- `src/tools/pennyone/intel/semantic.ts` upgrades semantic indexing to graphology/Louvain clustering.
- `package.json` and `package-lock.json` add `graphology` and `graphology-library`.
- `src/tools/pennyone/types.ts` adds `cluster`.
- `src/tools/pennyone/index.ts` changes intent extraction from batch `defaultProvider` calls toward per-sector `requestHostText` sub-agent calls.
- `src/tools/pennyone/intel/repository_manager.ts` adds Gungnir score boosts to search ranking.
- `src/tools/pennyone/intel/schema.ts` removes the `hall_repository_projection` view creation block.
- `src/core/mimir_client.ts`, `src/node/core/runtime/host_workflows/critique.ts`, and `src/node/core/runtime/weaves/distill.ts` show direct AutoBot/Hermes subprocess calls.

Risk: Per-file host requests in scan can be much slower and more failure-prone than batched local inference. Direct subprocess calls bypass configured provider routing and explain part of the chant/host instability.

### Agent Browser

- `.agents/skill_registry.json` adds `agent-browser`.
- `.agents/skills/agent-browser/SKILL.md` is new.
- `tests/unit/test_agent_browser.test.ts` is new and expects `/home/morderith/Corvus/agent-browser/bin/agent-browser-linux-x64`.

Risk: The test invokes a real browser automation binary and external URL (`https://example.com`), so it is not a hermetic unit test.

### Extension / Registry / Memory

- `.agents/extension/commands/tools/os.toml` changes command paths from `${extensionPath}/../../../bin/cstar.js` to `${extensionPath}/bin/cstar.js`.
- `.agents/extension/skills/chant-planner/SKILL.md` and the archived Gemini chant-planner skill are deleted.
- `.agents/memory/session_1771198460.json` and `session_1771199671.json` are deleted from memory root and appear under `.agents/memory/archive/`.
- `.agents/skill_registry.json` changes ownership for `scan`, `distill`, `warden`, and adds `engrave`.

Risk: The extension `bin/cstar.js` path needs live validation from the extension root. The diagnostic did not flag it now, but path semantics depend on how `${extensionPath}` is resolved.

## Recovery Work Already Applied

The interrupted refactor initially left CStar with TypeScript compile failures and AutoBot unit failures. Recovery edits applied in this session:

- Restored AutoBot bead execution to injected command execution.
- Restored SovereignWorker local HTTP LLM behavior.
- Fixed TUI `head/rest` use-before-declaration.
- Widened runtime host-text and delegation types for the `droid` provider.
- Added compatibility aliases for stale Taliesin forge type names.
- Fixed chant planner metadata typing.
- Fixed PennyOne receipt-state narrowing.
- Exposed `removeHallMountedSpoke` on `HallDatabase`.
- Restored repository metadata lookup in state projection.
- Added `cluster` to `FileData`.
- Corrected bead terminal status event checks to current Hall statuses.
- Fixed graphology import/type handling.
- Removed an invalid `...` placeholder from the MCP tool registration.
- Added an explicit telemetry DB interface to avoid exported external type leakage.
- Hardened and ran the Level 5 diagnostic.

## Architectural Critique

The direction is mixed.

Good direction:

- War Room state and session engraving are coherent with Hall-centered observability.
- Resource fail-fast in orchestration addresses the reported OOM-like failure mode.
- Provider-aware `droid` support can fit the host-native contract if it is routed through registry-backed provider adapters.
- Functional clustering can improve PennyOne’s semantic map.

Bad direction:

- Direct AutoBot/Hermes subprocess calls are appearing inside Mimir, critique, and distill. That is brittle and bypasses the host session/provider abstraction.
- Scan moved from batch inference to per-file host sub-agent requests, which can hang or overload host sessions.
- The stale `cstar chant` shell surface contradicts host-native chant ownership. The canonical host-native invocation contract needs operator confirmation before correction.
- New real-binary/browser tests are not isolated enough to be safe default unit tests.

## Recommended Next Repairs

1. Repair chant boundary drift first. The CLI `cstar chant` surface is stale if chant is host-native; the earlier timeout observation was a diagnostic miss because it exercised a legacy shell path rather than the canonical host-native skill surface.
2. Replace direct AutoBot/Hermes subprocess calls in TypeScript paths with `requestHostText` or a registry-backed provider adapter.
3. Add isolated tests for War Room state mutations and blackboard compaction.
4. Make agent-browser tests opt-in/integration-gated unless a mock binary/session is used.
5. Re-audit `scan` performance and failure behavior before using it broadly on the estate.

## Addendum: True Level 5 Inspection

The corrected Level 5 interpretation is: inspect every refactor surface for contract drift and runtime viability before creating correction work. `cstar chant` is not treated as the canonical planning invocation. Remaining `cstar chant` references are now findings.

New inspection beads were written to the Hall under the `level5-inspection` source kind:

- `pb-cstar-level5-refactor-inspection`
- `bead-l5-inspect-chant-host-native-boundary`
- `bead-l5-inspect-host-routing-bypasses`
- `bead-l5-inspect-war-room-state`
- `bead-l5-inspect-pennyone-graphology-scan`
- `bead-l5-inspect-engrave-memory-archive`
- `bead-l5-inspect-agent-browser-skill`
- `bead-l5-inspect-extension-paths`
- `bead-l5-inspect-diagnostic-scope`

New correction beads were written to the Hall under the `level5-correction` source kind:

- `bead-l5-correct-chant-remove-shell-surface` - `READY_FOR_REVIEW`; Option A was applied after operator confirmation: registry-visible host-native capability, no CLI field, no adapter id, no shell entrypoint, no `cstar.ts` command, and no generated package shell guidance.
- `bead-l5-correct-host-routing-bypasses` - replace or formally adapterize direct AutoBot/Hermes subprocess routes.
- `bead-l5-correct-extension-bin-path` - fix missing `${extensionPath}/bin/cstar.js` resolution.
- `bead-l5-correct-agent-browser-test-gate` - move real-browser/network checks out of default unit scope or mock them.
- `bead-l5-correct-pennyone-semantic-test-syntax` - fix the semantic empire test transform failure.
- `bead-l5-correct-engrave-idempotence-coverage` - add focused Engrave coverage.
- `bead-l5-correct-war-room-fail-loud-coverage` - add/fix War Room compaction and dispatcher state coverage.

The six broad correction beads above, except the chant bead already in review, were split into assignable child beads and marked `BLOCKED` with the note "assign child beads instead."

Child beads for subagent assignment are now `READY_FOR_REVIEW`:

- `bead-l5-routing-01-mimir-client-hosttext` - removed direct Hermes bypass from `src/core/mimir_client.ts`.
- `bead-l5-routing-02-critique-hosttext` - routed critique through HostTextInvoker and preserved branch ledger behavior.
- `bead-l5-routing-03-distill-hosttext` - routed distill through host text invocation and preserved episodic persistence.
- `bead-l5-extension-01-resolve-os-tool-path` - added the extension-local `bin/cstar.js` launcher.
- `bead-l5-agent-browser-01-hermetic-manifest-test` - default agent-browser unit coverage is hermetic.
- `bead-l5-agent-browser-02-integration-gate` - real browser/binary checks are explicit opt-in integration coverage.
- `bead-l5-pennyone-01-semantic-test-syntax` - semantic empire test syntax/temp isolation and cluster assertions fixed.
- `bead-l5-engrave-01-failfast-tests` - Engrave missing/malformed input tests added.
- `bead-l5-engrave-02-success-idempotence-tests` - Engrave success/archive/idempotence tests added.
- `bead-l5-warroom-01-blackboard-compaction-tests` - BlackboardManager focused tests added.
- `bead-l5-warroom-02-dispatcher-agent-state-tests` - dispatcher state/blackboard event tests added.

Rerun diagnostic result after completing the child beads and tightening the agent-browser heuristic:

```text
Files scanned: 449
Legacy drift: 0
Linscott breaches: 230
Integrity pulse: 0
Refactor integrity: 0
```

Focused evidence:

- `tests/unit/test_chant_host_native_dispatch.test.ts` passes and proves host-native chant guardrails fail closed.
- No remaining public `cstar chant` reference was found in `cstar.ts`, `.agents/skill_registry.json`, `.agents/skills/chant`, `src/packaging/distributions.ts`, `LEVEL_5_DIAGNOSTIC_REPORT.md`, or `LEVEL_5_DIAGNOSTIC_FINDINGS.json`.
- `tests/empire_tests/test_pennyone_phase3_semantic.ts` now passes and asserts semantic cluster propagation.
- `tests/unit/node-runtime/test_dispatcher.test.ts` now passes and covers `WORKING` to `SLEEPING` transitions plus blackboard event posting.
- `.agents/extension/commands/tools/os.toml` resolves through an existing extension-local `bin/cstar.js` launcher.
- `src/core/mimir_client.ts`, `src/node/core/runtime/host_workflows/critique.ts`, and `src/node/core/runtime/weaves/distill.ts` no longer contain direct `autobot_orchestrator.py` or `run_hermes` bypasses.
