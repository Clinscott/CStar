# Host-Native Skill Contract

## Scope

This is the invocation contract for the four current capabilities marked
`entry_surface: host-only` in `.agents/skill_registry.json`:

- `corvus-forge`;
- `researcher`;
- `cstar-closeout`; and
- `cstar-reliability-loop`.

They are agent-native procedures. They are not public shell commands, runtime
models, or dispatcher-owned executions.

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

## Terminal Policy

Direct terminal skill dispatch is forbidden:

- no `cstar run-skill <id>`;
- no dynamic registry-trigger execution;
- no shell wrapper that turns a `SKILL.md` into a model/process callback; and
- no legacy weave, One Mind, Ravens, AutoBot, or model-memory fallback.

A skill may explicitly direct the host to run a bounded terminal command when
the command itself is intrinsic to authorized work, such as a focused test or
read-only closeout inspection. That permission is command-specific. It does not
make the skill terminal-executable.

## Lane-Specific Rules

- `corvus-forge` uses the durable request -> authorize -> execute -> independent
  record_result lifecycle. Current v3 execute persists a Codex-host state-only
  handoff with `runner_owner: "codex-host"`, requested `gpt-5.6-luna`/`max`,
  `host_launch_required: true`, and no provider, cognition, or CStar launch at
  handoff. The private Hermes `cstar-hub` MiniMax-M3 adapter is explicit legacy
  v2 compatibility only; direct Hermes and public AutoBot remain retired.
  Requested selector and host-attested actual identity are recorded separately;
  actual is `unreported`/`null` without attestation.
  After `host_handoff_queued` or `host_handoff_replayed`, the active host must
  invoke `npm run consume:forge-host-handoff` with the exact returned path,
  hashes, request, execution, attempt, and scope fields. The command is an
  intrinsic read-only host boundary: it uses no-follow descriptor checks and a
  final target/output identity revalidation, returns no job on drift, and does
  not mutate lifecycle state, Hall/SQLite, validation tickets, or provider
  state. Its `ready_for_host_execution` receipt does not remove the sequential
  TOCTOU boundary before later host opens/execution.
- `researcher` uses authorized Researcher source lanes. New live collection or
  source expansion remains operator-gated.
- `cstar-closeout` assembles evidence and handoff state first. Stage, commit,
  push, merge, install, cache reconciliation, restart, and deploy are separate
  actions requiring their applicable explicit grants.
- `cstar-reliability-loop` coordinates bounded validation and automatic repair
  continuation; CStar records state, Forge implements, and an independent
  validator accepts.

PMTs may be queried only as mapped project information repositories and may
receive a compact `STATE_UPDATE`; they grant no ownership, execution, approval,
review, routing, monitoring, or lifecycle authority. MM is inactive and has no
active routing, synthesis, ownership, relay, review, or execution role.

## Failure Behavior

If the host cannot read the instruction file, the kernel surface is degraded,
or the required gate is absent, stop the affected transition and report the
exact failure. Do not fall back to a public model route, legacy runtime, ad hoc
Hall/SQLite write, or untracked shell mutation.
