# SET-01 Independent Validation Report

- Validation id: `validation:cstar-auto-p0-outcome-deadline-telemetry-20260804-r2`
- Bead: `bead:mcp:activate-the-existing-six-typed-outcomes-and-bou-msf54nco`
- Worktree: `/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803`
- HEAD observed: `afbbc1770ec6a7a2adc15b83f91c5586ac2525c0`
- Validation time: `2026-08-04T21:26:33Z`
- Requested model: `gpt-5.6-luna/max`
- Actual model identity: `unreported` (the host did not expose it)

## Verdict

**ACCEPTED.** The current SET-01 bytes pass the focused typed-outcome/deadline suite, the legacy Augury/bead telemetry compatibility test, the adjacent authorization/storage/contract/surface suites, typecheck, whitespace validation, and the all-changed-source/test line audit. The current bytes were validated after an in-scope repair changed the earlier builder hashes; the final receipt hashes below are authoritative for this turn.

## Focused behavior

- The public response boundary publishes exactly six outcomes: `ok`, `needs_input`, `guardrail_block`, `domain_terminal`, `transport_error`, and `internal_error`.
- `guardrail_block` and `domain_terminal` remain observable normal outcomes and do not set MCP `isError`; only `transport_error` and `internal_error` do.
- Public READ instrumentation defaults to 5000 ms and clamps at a 30000 ms hard maximum.
- Timeout and caller cancellation are distinct `transport_error` classifications with `read_deadline_exceeded` and `read_cancelled` codes.
- Validation telemetry preserves legacy `status: "recorded"` compatibility when no explicit negative persistence evidence exists. Explicit `validation_persisted: false`, partial/rollback/not-persisted statuses, and matching negative warning/error evidence remain non-recorded.

## Commands and results

1. Focused SET-01 plus legacy compatibility: 34 tests, 4 suites, 34 passed, 0 failed.
2. Adjacent authorization, validation-evidence, telemetry-storage, response-contract, kernel-surface, spoke-telemetry, and catalog suites: 60 tests, 7 suites, 60 passed, 0 failed.
3. `npm run typecheck`: exit 0.
4. `git diff --check`: exit 0.
5. Changed source/test line audit: 50 files, maximum 500 lines, every file at or below the 500-line limit.
6. Diff inspection: SET-01 attribution is limited to `src/tools/cstar-kernel-mcp/contracts/responses.ts`, `src/tools/cstar-kernel-mcp/telemetry/usage.ts`, and the new `tests/unit/cstar-kernel-mcp/test_mcp_outcome_deadline_instrumentation.test.ts`. Other dirty paths were preserved and are not attributed to this validation.

## Final SET-01 artifacts

| Artifact | SHA-256 | Bytes | Lines |
|---|---|---:|---:|
| `src/tools/cstar-kernel-mcp/contracts/responses.ts` | `64bb908c07fded134fd6b95e9f70471a6ae900063b7185cc1a9f4fddb638c3d4` | 8008 | 256 |
| `src/tools/cstar-kernel-mcp/telemetry/usage.ts` | `77a8a1e10a3861a88ef5d6770574562db589f0528f2adfad6a7ebb91ee401013` | 19865 | 494 |
| `tests/unit/cstar-kernel-mcp/test_mcp_outcome_deadline_instrumentation.test.ts` | `e5c8b68f4bef52f8d40519cb9f7e0afecb1cf14a2bbf29fbf84e3b08ccbb116d` | 6302 | 146 |

## Scope and effects

No CStar MCP call, provider attempt, restart/reload, Git mutation, install, deployment, source/test edit, secret/config mutation, or external state change was performed. The only writes were the five bounded receipts inside this validation directory. The unrelated dirty worktree was not cleaned, reset, staged, or overwritten.

This is independent source/test acceptance only. It does not claim runtime activation, provider execution, deployment, or production status.
