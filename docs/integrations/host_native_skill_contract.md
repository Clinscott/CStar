# Host-Native Skill Contract

## Scope

This is the invocation contract for the three current capabilities marked
`entry_surface: host-only` in `.agents/skill_registry.json`:

- `corvus-forge`;
- `researcher`; and
- `cstar-closeout`.

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

The host may call deterministic kernel primitives required by a skill. Those
tool calls record CStar lifecycle state; they do not make the kernel the owner
of host cognition or grant permission absent from the operator/repository
policy.

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
Hall/SQLite write, or untracked shell mutation.
