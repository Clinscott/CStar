# Host-Native Skill Contract

## Scope

This is the invocation contract for the three current capabilities marked
`entry_surface: host-only` in `.agents/skill_registry.json`:

- `corvus-forge`;
- `researcher`; and
- `cstar-closeout`.

They are agent-native procedures. They are not public shell commands, runtime
models, or dispatcher-owned executions.

## Control-Plane and Orchestration Boundary

CStar is only the deterministic state manager. It records bounded lifecycle
state, receipts, validation, and completion, but it does not launch agents,
retained workthreads, providers, or model cognition.

CoS in Codex is the orchestrator and supervisor/delegator. It binds and
sequences CStar state, defines bounded assignments, dispatches owning workers,
reviews returned evidence, requests correction, records independent validation,
resolves beads, and closes out. CoS must not implement, research, debug, edit
source, run worker tests or validation, or silently take over failed worker
work.

A `workthread` means a retained/resumable host-issued worker thread with stable
lineage. It is a host continuity surface, not a CStar kernel worker launcher or
a provider launcher. No runtime support is claimed unless the host exposes the
surface.

## Host Path

The active host:

1. reads the selected skill's `SKILL.md` completely;
2. keeps current operator, global Corvus, and nearest repository policy above
   registry instructions;
3. uses `cstar-kernel` MCP tools for bounded health, handoff, discovery,
   request, execution, validation, and completion state;
4. uses host tools only within the skill's explicit scope and operator gates;
   and
5. returns evidence that distinguishes source, lifecycle, installed, live, and
   production claims.

`entry_surface: host-only` means the procedure executes in the already active
host conversation. It does not create a callback from CStar into the host.
CStar must not invoke a model, `MimirClient`, One Mind broker, provider shell,
or generic `hostSessionInvoker` to simulate skill execution.

## Kernel Boundary

The kernel may catalog a host-only skill and fail closed if terminal or runtime
dispatch is attempted. Recognition in `cstar manifest`, `active_in_runtime`, or
an adapter map is discovery evidence only.

CStar must not become an agent launcher. It must not create or revive a worker
thread, provider attempt, legacy host delegation path, or generic model callback
from a capability declaration.

A failed kernel adapter executes exactly once. CStar preserves the original
failure and adds `operator_action_required: true` with
`automatic_recovery_attempted: false`; it performs no provider consultation,
retry, replan, recursive host-governor dispatch, or `auto_execute`. Any retry
or replan is a fresh top-level invocation with its own operator authority.
Likewise, once a capability is classified as agent-native or host-workflow,
missing host state and activation failures are terminal for that invocation;
a stale `allow_kernel_fallback` field cannot transfer ownership to the kernel.

Ravens never consults a provider merely because one is present. The operator
must request one supervisor decision explicitly with `--host-supervision` (or
the equivalent typed payload). That decision may either confirm the exact
operator-requested action and target or return observation-only. A missing
provider, invalid response, supervisor failure, or
attempted action/target substitution fails closed before repository discovery
or any local cycle. The receipt distinguishes the dispatched supervisor request
from the undispatched maintenance action with `supervisor_request_dispatched:
true` and `execution_dispatched: false`; when a provider is missing, both are
false. No local fallback or recovery runs.

The host may call deterministic kernel primitives required by a skill. Those
tool calls record CStar lifecycle state; they do not make the kernel the owner
of host cognition or grant permission absent from the operator/repository
policy.

## Provider Attempt Identity

Host-backed runtime work binds both provider and execution surface before an
attempt. Availability of an invoker, bridge, provider CLI, shell, broker, or
environment variable cannot select or replace that surface. The supported
surface is carried as a typed request field and one failed surface never falls
through to another.

Every returned delegated handle or result must report all five attempt fields:
`requested_provider`, `actual_provider`, `requested_surface`,
`actual_surface`, and `execution_dispatched`. Missing result evidence fails
closed; it is never reconstructed from the expected provider, top-level result,
available dependency, or a successful-looking payload. Structured error
evidence outranks legacy message text. A plain failure with no trustworthy
attempt evidence records `execution_dispatched=unreported`, not `false`.

Timeout ownership remains with the process runner. At the deadline the exact
attempt receives an `AbortSignal`; CStar waits for that runner to settle before
cleaning its scratch files or returning the timeout. The attempt is reported as
dispatched, is never retried, and cannot switch provider or surface.

## Codex Worker Selector Contract

Every substantive direct Codex subagent and retained/resumable workthread must
request `gpt-5.6-luna` with reasoning effort `max` through a host surface that
exposes an enforceable selector. Record `requested_model`,
`requested_reasoning`, `selector_status`, and `actual_identity` separately. If
the host reports no actual identity, record `actual_identity: unreported` and
do not infer it from the provider, task, or prompt.

Selector absence or mismatch is a visible blocked/unsupported result. The host
must not silently substitute another model, reasoning effort, provider, or
surface. The Augury exception is bounded: its first opinion requests
`gpt-5.6-sol` at `max`, and a needed second opinion requests distinct
`gpt-5.6-terra` at `max`; both still require the same selector and identity
receipt. This contract defines no numeric concurrency cap.

## Worker-Owned Host-Goal Contract

A CStar bead or decision is canonical deterministic state; a host goal is
worker-local evidence. CoS owns no host goal and must never create, resume,
update, pause, block, complete, or close one. CoS only binds the exact bead and
dispatches the owning worker through the host surface.

Every substantive implementation, research, debug, or validation assignment
goes to a Luna Max worker or retained workthread that owns exactly one bounded
host goal. Its objective binds the exact CStar bead id, decision, target paths,
and checker contract. Recoverable correction stays in the same retained
workthread and goal. A replacement worker gets a new host goal plus an explicit
bounded CStar handoff; it never silently inherits hidden host-goal state. A
distinct validator owns a distinct validation goal and never reuses the
implementation goal.

Host-goal status is worker-local evidence, never CStar lifecycle authority.
Legacy CoS-held goals remain paused and historical until a supported transfer
exists; never delete, silently resume, or falsely complete them. CStar has no
generic host-goal or worker-launcher surface. If `cstar_goal_resume` is exposed,
it records only a bounded continuity receipt and does not mutate a host goal or
launch a worker.

## Terminal Policy

Direct terminal skill dispatch is forbidden:

- no `cstar run-skill <id>`;
- no dynamic registry-trigger execution;
- no shell wrapper that turns a `SKILL.md` into a model/process callback; and
- no CStar kernel worker launcher, provider launcher, revived legacy host
  delegation, or unexposed workthread runtime; and
- no legacy weave, One Mind, Ravens, AutoBot, or model-memory fallback.

A skill may explicitly direct the host to run a bounded terminal command when
the command itself is intrinsic to authorized work, such as a focused test or
read-only closeout inspection. That permission is command-specific. It does not
make the skill terminal-executable.

## Lane-Specific Rules

- `corvus-forge` uses only the durable request/execute/result lifecycle. The
  private Hermes `cstar-hub` MiniMax-M3 adapter is sealed inside Forge; direct
  Hermes and public AutoBot remain retired. Requested and actual model identity
  are recorded separately.
- `researcher` uses authorized Researcher source lanes. New live collection or
  source expansion remains operator-gated.
- `cstar-closeout` assembles evidence and handoff state first. Stage, commit,
  push, merge, install, cache reconciliation, restart, and deploy are separate
  actions requiring their applicable explicit grants.

PMTs may be queried only as mapped project information repositories and may
receive a compact `STATE_UPDATE`; they grant no authority. MM is legacy.

## Failure Behavior

If the host cannot read the instruction file, the kernel surface is degraded,
or the required gate is absent, stop the affected transition and report the
exact failure. Do not fall back to a public model route, legacy runtime, ad hoc
Hall/SQLite write, untracked shell mutation, or a substitute model/effort when
the requested worker selector is absent or mismatched.
