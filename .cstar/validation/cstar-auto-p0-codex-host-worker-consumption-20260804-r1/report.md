# SET-03 independent validation report

Validation id: `validation:cstar-auto-p0-codex-host-worker-consumption-20260804-r1`

Bead: `bead:mcp:make-current-v3-forge-execution-consume-the-dura-msf54nyu`

Worktree: `/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803`

Verdict: `ACCEPTED`

## Execution boundary

This was a read-only independent validation pass. It did not invoke CStar MCP,
Forge, a provider, a network source, a process launcher, restart/reload, Git,
install, deploy, config, or secrets. The only writes were the five bounded
receipt artifacts in this receipt directory. Existing unrelated dirty work was
observed and preserved; it is not attributed to SET-03.

Requested validator identity was `gpt-5.6-luna/max` from the active SET lane.
This root validator's actual model is `gpt-5`; no Luna selector was available
for this validation turn. The host-job contract itself records requested
`gpt-5.6-luna/max` and actual identity `null` when the host does not expose one.
These identities remain separate and no actual Luna execution is claimed.

## Test and structural evidence

- Focused SET-03 lifecycle: 66/66 tests passed across 9 suites.
- Exact adjacent command: 9/9 tests passed across 2 suites.
- The requested path `tests/unit/cstar-kernel-mcp/test_codex_host_worker_runtime_lineage.test.ts`
  is absent in this worktree. It was not silently counted as executed.
- The available equivalent runtime-lineage contract,
  `tests/unit/cstar-kernel-mcp/test_runtime_lineage_codex_host.test.ts`,
  passed 7/7 tests across 1 suite.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- All ten SET-03 source/test files are at or below 500 lines; maximum is
  `src/tools/cstar-kernel-mcp/tools/forge_execute.ts` at 490 lines.
- Final hashes and byte counts are recorded in `manifest.json`.

## Independent semantic probes

The implementation and focused tests jointly prove the following bounded
properties:

- Current v3 persists a `cstar.codex_host_worker_job.v2` envelope before
  returning the host handoff; the handoff is durable and host-owned.
- `project_root` is canonical and target/output paths are absolute, canonical,
  contained, deduplicated, and bound by the target-path digest.
- The job records `runner_owner: codex-host`, requested model
  `gpt-5.6-luna`, requested reasoning `max`, enforced selector status, and
  separate nullable actual identity.
- The one-use validator-ticket binding is carried from SET-02 and is bound to
  repository, bead, execution receipt, attempt, scope digest, expiry, and
  independent-validator fields when supplied.
- The current host handoff records zero cognition launch, zero CStar launch,
  zero provider requests, no network access, and no spend uncertainty. No
  provider or process was launched by this validation.
- Current v3 rejects legacy Hermes/MiniMax provider/fallback fields and does
  not fall back to the legacy adapter. Legacy runtime bytes remain readable as
  non-actionable history.
- Idempotent replay returns the same durable handoff; terminal or UNKNOWN
  attempts fail closed and cannot be retried through this path.
- Malformed handoffs, duplicate/conflicting records, path escape, root drift,
  duplicate paths, ticket drift, and invalid spend claims fail closed.
- Guardrail and preauthorization/domain responses remain MCP-success responses
  without `isError`; transport/protocol failures retain the error channel.

## Scope conclusion

The SET-03 source/test set is byte-stable, structurally bounded, and behaviorally
consistent with the state-only Codex-host v3 contract. The missing requested
runtime filename is a repository naming discrepancy, covered transparently by
the available equivalent 7-test runtime-lineage suite; it is not a source
behavior failure. No CStar result receipt was recorded because this validation
instruction explicitly prohibited CStar calls.
