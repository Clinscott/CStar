# Independent repair validation

- validation_id: `validation:cstar-p0-full-batch-repair-host-handoff-20260804-r1`
- bead_id: `bead:mcp:repair-aggregate-full-suite-current-v3-codex-hos-msfai02i`
- verdict: `REJECTED`
- requested model: `gpt-5.6-luna/max`
- actual model: `unreported`
- worktree: `/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803`

## Focused result

The exact prescribed nine-file command exited `1`: `4` test files passed and `5` failed; `0` were cancelled or skipped. The failing files were `test_forge_adapter_project_root.test.ts`, `test_forge_authorization_one_shot.test.ts`, `test_forge_natural_language_authorization.test.ts`, `test_forge_preprovider_execute_integration.test.ts`, and `test_forge_runtime_lifecycle_gate.test.ts`. The passing files were `test_durable_async_dispatch.test.ts`, `test_forge_codex_host_worker_dispatch.test.ts`, `test_operator_authorization_scope_binding.test.ts`, and `test_worker_job_lifecycle_binding.test.ts`.

The owned current-v3 integration proof does not reach host-handoff queueing. At `tests/unit/cstar-kernel-mcp/test_forge_preprovider_execute_integration.test.ts:76-77`, the fixture sets `CSTAR_FORGE_TEST_MODE` and `CSTAR_FORGE_RUNTIME_TEST_BYPASS` but not the synthetic `NODE_TEST_CONTEXT` required by `src/tools/cstar-kernel-mcp/contracts/runtime.ts:82-90`. A bounded reproduction returns `forge_runtime_not_ready:forge_runtime_live_launcher_required,forge_runtime_distinct_code_control_roots_required` instead of the expected `pending_authorization_recorded` at test line `109`. Therefore the required `host_handoff_queued`/`host_handoff_replayed`, repair binding, idempotency, zero-provider/spend, and no-fallback assertions at test lines `130-201` are not accepted.

The separately prescribed `npm run typecheck` passed with exit code `0`. The prescribed `git diff --check` passed with exit code `0`. The touched production/test line audit covered `78` files (`47` production and `31` test); the maximum was `500` lines in `src/tools/cstar-kernel-mcp/tools/augury_mission_binding.ts`, so the `<=500` policy passed.

## Source contract review

The static contract review passed for the requested invariants:

- `src/tools/cstar-kernel-mcp/tools/forge_execute.ts:214-223` routes a current-v3 request to `dispatchCurrentForgeV3` before the legacy adapter branch.
- `src/tools/pennyone/intel/forge_host_worker_dispatch.ts:255-281` rejects a missing surface or live source, verifies scope and package locks, and checks runtime readiness before reservation.
- `src/tools/pennyone/intel/forge_host_worker_dispatch.ts:281-288` reserves in `codex-host` mode, checks readiness again after a new reservation, and refuses legacy provider/model drift or unknown spend.
- `src/tools/pennyone/intel/forge_host_worker_dispatch.ts:188-225` binds and validates the handoff, requires zero provider attempts and no spend, and persists/replays with no-clobber and duplicate-conflict protection.
- `src/tools/pennyone/intel/forge_host_worker_dispatch.ts:227-231,289-310` exposes queued/replayed host outcomes and refuses terminal/legacy fallback paths.
- The owned handoff unit test covers requested-versus-actual identity, legacy fields, root/scope/spend/ticket rejection, persistence, replay, malformed input, hash mismatch, and duplicate conflict at `tests/unit/cstar-kernel-mcp/test_forge_codex_host_worker_dispatch.test.ts:79-142`.

No static weakening of those source invariants was found. This does not cure the failed focused acceptance proof: the current-v3 integration test does not establish the requested behavior in this worktree, so the repair is rejected.

## Boundary

No source or test file was edited by the validator. Unrelated dirty work was preserved. No CStar lifecycle/result call, provider call, restart/reload, install, deployment, configuration or secret mutation, or Git mutation was performed. This receipt is source/test validation only; it does not claim host activation or production status.
