# Corvus Star Augury Operator Handoff

Status: ACTIVE

Next session runway: `NEXT_SESSION_AUGURY.md`

## Purpose

Corvus Star Augury [Ω] is the routing contract for an agentic turn. It tells an agent what path to take, why that path was selected, which Council expert lens applies, and where bounded evidence lives in Mimir's Well.

It is not a telemetry trace, execution trace, session log, Hall search result, or display-only artifact.

## Required Agent Order

Run from the CStar root unless an explicit spoke command says otherwise:

1. `./cstar augury doctor --json`
2. `./cstar augury explain --json`
3. `./cstar augury handoff --json`
4. `./cstar hall "<intent, bead id, target path, or failure text>"`
5. Inspect only the handoff targets, Mimir targets, and directly adjacent files needed for the task.

If `doctor.status` is `fail`, repair or recover the Augury contract before editing or dispatching work. If it is `warn`, resolve the warning when it affects scope, route, expert choice, or Mimir target quality.

## Field Meaning

- `scope`: `brain:CStar` means foundational engine work. `spoke:<name>` means a specific spoke is the target. Do not treat foundational CStar Augury work as spoke work.
- `route`: selected path in `<Intent Category> -> <SKILL|WEAVE|SPELL>: <selection>` form.
- `expert`: Council lens assigned to the task. Examples: `CARMACK` for game/performance work, `KARPATHY` for AI/model work, `SHANNON` for signal/observability/noise work.
- `mimir`: bounded discovery targets. Prefer concrete files, directories, or Hall handles. More than three targets are prompt-noisy and should be narrowed.
- `confidence`: metadata for future learning. It must not be displayed in the prompt block as agent-facing instruction.
- `warnings`: routing risks. They are operational leads, not prose decorations.

## Prompt Budget Contract

The host prompt uses the full Augury once per session or planning key, then lite Augury on later calls. Full mode gives the route, scope, intent, Mimir targets, expert lens, guardrails, Corvus standard, work standard, trajectory, and verdict. Lite mode keeps only the minimum routing fields.

Agents should use Augury as routing context, not as text to echo back to the user.

## Learning Ledger

Augury learning metadata is written for future prompt optimization:

- Default ledger: `.agents/state/augury-learning.jsonl`
- Override: `CSTAR_AUGURY_LEARNING_LEDGER`
- Disable: `CSTAR_AUGURY_LEARNING_DISABLED=1`
- Optimizer marker: `optimizer_family: GEPA_DSPY`

Do not set up GEPA/DSPy during normal Augury operation. The ledger is the future dataset source for evaluating which routes, experts, Mimir targets, and steering modes produced useful agent outcomes.

## Next Session Lead

The next high-value upgrade is an Augury usefulness evaluator that reads `augury-learning.jsonl`, joins outcomes from Hall/runtime status, and reports route quality by scope, expert, target count, confidence source, and full-vs-lite mode.

Acceptance contract: `docs/augury-usefulness-evaluator-contract.md`

Keep that evaluator read-only until the learning metric is proven stable.
