# SET-01 Independent Validation Report

- Validation id: `validation:cstar-auto-p0-outcome-deadline-telemetry-20260804-r1`
- Bead: `bead:mcp:activate-the-existing-six-typed-outcomes-and-bou-msf54nco`
- Decision: `decision:cstar-auto-p0-outcome-deadline-telemetry-20260804`
- Worktree: `/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803`
- HEAD observed: `afbbc1770ec6a7a2adc15b83f91c5586ac2525c0`
- Validation time: `2026-08-04T21:20:07Z`
- Requested model: `gpt-5.6-luna/max`
- Actual model identity: `unreported` (the host did not expose it)
- Validator thread id: `unreported`
- Validator turn id: `unreported`

## Verdict

**REJECTED.** The SET-01 focused contract passes, but the existing legacy telemetry compatibility test fails. `deriveMcpUsefulnessEvent()` now treats `{status: "recorded"}` without an explicit persistence flag as not recorded, while the existing public/singleton compatibility contract expects that legacy recorded status to produce `validation_recorded: true`.

Failure:

- `tests/unit/cstar-kernel-mcp/test_augury_bead_result.test.ts:401`
- Expected `validation_recorded === true`; received `false`.
- Suite result: 19 tests, 18 passed, 1 failed.

This is not lifecycle acceptance. No CStar tool, provider, restart, install, deploy, or source/test mutation was performed by the validator.

## Scoped implementation inspection

The SET-01 implementation attribution is bounded to these changed artifacts. The two tracked preimages match the builder-provided preimages; the other scoped baseline files are unchanged. The worktree contains unrelated dirty paths from prior work, which were not treated as SET-01 changes and were not modified.

| Artifact | Preimage | Final SHA-256 | Lines |
|---|---|---|---:|
| `src/tools/cstar-kernel-mcp/contracts/responses.ts` | `883a9d740a25ad98bc2fe3f584441f7ca12b0819627229ce6dbd5b68f8849b46` | `64bb908c07fded134fd6b95e9f70471a6ae900063b7185cc1a9f4fddb638c3d4` | 256 |
| `src/tools/cstar-kernel-mcp/telemetry/usage.ts` | `f322ca12a008a9fabc20854d77f6c004abd2048759145e06a0273a6bb30ab13d` | `1fffbd7c6e146a86e598b320bcae4e3354cbd01d65069097e23531dcca0d0091` | 493 |
| `tests/unit/cstar-kernel-mcp/test_mcp_outcome_deadline_instrumentation.test.ts` | new | `daaf6d4407b2c055431e139fd77f2fb0ee32931db5db45441a94d79e5a8ef144` | 143 |

Scoped unchanged line audit: `deadlines.ts` 225, `read_deadline.ts` 104, `test_typed_outcomes.test.ts` 97, and `test_read_deadlines.test.ts` 109. Every scoped production/test file is below the 500-line limit. `git diff --check` passed.

The inspected implementation does enforce the requested core behavior: public READ defaults to 5000 ms and clamps at 30000 ms; timeout and caller cancellation use distinct `transport_error` codes; the six typed outcomes are covered; normal guardrail/domain-terminal outcomes do not set MCP `isError`; and partial/rollback/not-persisted results are excluded from `validation_recorded`.

## Commands and results

| Command | Result |
|---|---|
| `node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_typed_outcomes.test.ts tests/unit/cstar-kernel-mcp/test_read_deadlines.test.ts tests/unit/cstar-kernel-mcp/test_mcp_outcome_deadline_instrumentation.test.ts` | PASS — 15 tests, 3 suites, 15 passed, 0 failed |
| `node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_mcp_tool_telemetry.test.ts tests/unit/cstar-kernel-mcp/test_validation_telemetry.test.ts tests/unit/cstar-kernel-mcp/test_record_result*.test.ts` | FAIL validation collection — process exit 0 but 0 tests and 0 suites; no matching files exist in this worktree |
| `node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_augury_bead_result.test.ts` | FAIL — 19 tests, 18 passed, 1 failed at line 401 |
| `node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_instrumentation_mutation_identity.test.ts tests/unit/cstar-kernel-mcp/test_validation_evidence_type_boundary.test.ts tests/unit/cstar-kernel-mcp/test_telemetry_storage_boundary.test.ts` | PASS — 13 tests, 3 suites, 13 passed, 0 failed |
| `node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_response_contracts.test.ts` | PASS — 5 tests, 1 suite, 5 passed, 0 failed |
| `node scripts/run-tsx.mjs --test tests/unit/cstar-kernel-mcp/test_kernel_surfaces_core.test.ts tests/unit/cstar-kernel-mcp/test_kernel_surfaces_spoke_telemetry.test.ts tests/unit/cstar-kernel-mcp/test_tool_catalog.test.ts` | PASS — 42 tests, 3 suites, 42 passed, 0 failed |
| `npm run typecheck` | PASS — exit 0 |
| `git diff --check` | PASS — exit 0 |
| `wc -l` scoped source/test audit | PASS — all 7 audited files are <=500 lines |

## Exact repair required

Repair the owning telemetry helper and its focused compatibility coverage before revalidation:

1. In `src/tools/cstar-kernel-mcp/telemetry/usage.ts`, make `validationWasRecorded()` preserve legacy `status: "recorded"` as `validation_recorded: true` when no explicit negative persistence signal is present, while continuing to return false for `validation_persisted: false`, `partial`, rollback, `not_persisted`, and corresponding warning/error states. Keep `recorded_verified` and `recorded_unverified` behavior unchanged.
2. Add/retain adversarial tests for `{status: "recorded"}` (legacy compatibility true), `{status: "recorded", validation_persisted: false}` (false), and rollback/partial/not-persisted variants (false). The existing `test_augury_bead_result.test.ts` must pass without weakening the SET-01 negative cases.
3. Rerun the actual legacy telemetry file explicitly; the requested telemetry glob currently matches no files and cannot substitute for that check. Re-run the focused SET-01 suite, typecheck, diff check, line audit, and independent review before acceptance.

