# Native task-control integration contract

The MCP projection is declarative. `NATIVE_TASK_CONTROL_CONTRACT` exposes the
schema names, event kinds, hard limits, prohibited dependencies, stable error
codes, and high-level semantics. It does not create authority and it does not
dispatch tasks.

## Required boundary objects

The implementation provides these versioned contracts:

* `cstar.native_role_manifest.v1`
* `cstar.native_goal_generation.v1`
* `cstar.native_controller_lease.v1`
* `cstar.native_task_control_event.v1`
* `cstar.native_succession_receipt.v1`
* `cstar.native_cohort_wait.v1`
* `cstar.native_circuit_breaker.v1`
* `cstar.native_work_terminal_receipt.v1`

Callers should construct objects with the receipt builders, then pass the
canonical event to `applyTaskControlEvent`. The returned transition contains
the next immutable state, acceptance, idempotence, and (when applicable) an
extended terminal receipt. A rejected transition never invokes a model or
provider; state is fenced when the contract requires an immediate breaker.

## Stable failures

The exported `NATIVE_TASK_CONTROL_ERROR_CODES` map is the sole source for
machine-readable failures. In particular, unchanged-generation restart is
`CSTAR_NATIVE_TASK_GENERATION_LOOP`, unavailable native capability is
`CORVUS_NATIVE_TASK_SURFACE_UNAVAILABLE`, and any Forge invocation is
`CSTAR_FORGE_DEFUNCT`.

## Host integration

The host may supply a requested selector and an attested actual identity as
observations. The interpreter never infers one from model output, user-agent
text, a task ID, scheduling state, or a callback. A missing identity is
`unreported` and fails selector-sensitive work closed. Native wait capability
is similarly explicit; shell loops, CLI polling, transcripts, Hall/SQLite,
plugins, and provider bridges are not substitutes.

## Lifecycle boundary

The contract is source-only. It does not call CStar lifecycle operations,
write Hall or SQLite, install or activate packages, restart a host, publish
Git, or claim acceptance. Independent validation and the applicable CSF-D007
checkpoint remain separate proof planes.
