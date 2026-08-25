# SET-02 independent validation report

Validation id: `validation:cstar-auto-p0-independent-validation-ticket-20260804-r1`

Bead: `bead:mcp:add-one-immutable-one-use-independent-validator--msf54no2`

Worktree: `/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803`

Verdict: **ACCEPTED for the exact SET-02 scope**.

Requested model: `gpt-5.6-luna/max`

Actual model identity: `unreported` (the host exposed no enforceable runtime model identity).

## Runtime

All tests and typecheck used the pinned runtime with `PATH=/home/morderith/.nvm/versions/node/v25.8.1/bin:$PATH`: Node `v25.8.1`, module ABI `141`, and a plain `better-sqlite3` load passed. The default runtime observation was Node `v26.5.0`, module ABI `147`, and a plain `better-sqlite3` load also passed at validation time; it was not used for the required suites because the worktree has a documented Node 26 ABI risk.

## Required focused validation

The exact required command passed **28/28 tests across 4 suites**, with 0 failures, cancellations, skips, or todos:

`test_terminal_forge_validation_linkage.test.ts`

`test_validation_evidence_type_boundary.test.ts`

`test_host_workflow_validation.test.ts`

`test_validation_ticket_spoke_result.test.ts`

The passing cases cover the host-v3 validator principal, recorder separation, immutable one-use ticket issuance and consumption, repository/bead/receipt/attempt/scope binding, expiry, nonce and malformed-token rejection, replay rejection, wrong-validator rejection, rollback on Forge finalization failure, and spoke-root evidence resolution with CStar Hall lifecycle persistence.

## Adjacent validation

The bounded eight-suite adjacent selection ran **57/59 tests across 8 suites**; the two failures are retained as visible compatibility notes, not hidden:

- `tests/unit/cstar-kernel-mcp/test_forge_durable_execution.test.ts:392` expects `driftResult.isError === true`, observed `undefined`.
- `tests/unit/cstar-kernel-mcp/test_forge_execute_authority.test.ts:68` expects `result.isError === true`, observed `undefined`.

Both assertions exercise guardrail/preauthorization responses. The current typed-outcome contract intentionally reserves MCP `isError` for transport/internal failures and leaves `guardrail_block` observable without `isError`; these are prior SET-01 expectation updates outside the eight SET-02 paths. The remaining adjacent compatibility selection passed **51/51 tests across 6 suites**. No SET-02 ticket or validation path was implicated by either failure.

## Structural and source review

`npm run typecheck` passed. `git diff --check` passed. The trailing-whitespace audit passed. Every SET-02 touched source/test path is at most 500 lines; maximum is `register_core_tools.ts` at 479 lines. The eight final SET-02 artifact hashes are:

| Path | SHA-256 | Lines |
| --- | --- | ---: |
| `src/tools/cstar-kernel-mcp/register_core_tools.ts` | `732497b10c00acb33dc71879ebc703b8f9654a71b1e5f3ee36298441ab49bfc0` | 479 |
| `src/tools/cstar-kernel-mcp/tools/result.ts` | `ef02a8101246618d09693a028626629324757f69ebe13db4f3c7717298e27241` | 355 |
| `src/tools/cstar-kernel-mcp/tools/validation_evidence.ts` | `cc237efa20c89833683b0da9348fbb7becc04691587f5bdcb44b3e013f33723f` | 242 |
| `src/tools/pennyone/intel/forge_validation_controller.ts` | `e257caba3ca9000387c85453a9e23128d276a648e70ee8e582dc76d47315417b` | 425 |
| `src/tools/pennyone/intel/schema_tables_runtime.ts` | `d10aa4eb87cd27baddfbe7a6a6dbe05ab00d771c65feec6f50dd761106710b6b` | 314 |
| `src/tools/pennyone/intel/validation_ticket_controller.ts` | `34f933f0d98e98e47a40cf66a6163f3fa3a66ce116f1303130341b3d17aa2e22` | 378 |
| `tests/unit/cstar-kernel-mcp/test_validation_ticket_spoke_result.test.ts` | `9dd3c0fbf230d614d5d798e9274cbe3c1c07c207632c236cc83861064f1d21ae` | 461 |
| `tests/unit/cstar-kernel-mcp/validation_ticket_test_helpers.ts` | `c517d826393ac46b73a330d6e2827a9ece035f531034b83786efb10374ad7114` | 107 |

An independent direct probe derived the v3 validator thread/turn from the host receipt’s `independence` fields and rejected a recorder-shaped v3 identity. Recorder provenance remained separate. No unrelated dirty path was attributed or overwritten.

## Boundaries

This validation performed no CStar MCP call, Forge/provider attempt, restart/reload, Git mutation, install, deploy, config/secrets mutation, or write outside this receipt directory. The receipt is source/test acceptance evidence only; no runtime activation or production claim is made.
