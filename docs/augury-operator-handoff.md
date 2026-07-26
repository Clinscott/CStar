# Corvus Star Augury Operator Handoff

Status: ACTIVE

Next session runway: `NEXT_SESSION_AUGURY.md`

## Purpose

Corvus Star Augury [Ω] is the routing contract for an agentic turn. It tells an agent what path to take, why that path was selected, which Council expert lens applies, and where bounded evidence lives in Mimir's Well.

It is not a telemetry trace, execution trace, session log, Hall search result, or display-only artifact.

## Required Agent Order

Use the connected CStar kernel MCP unless an explicit local recovery procedure
says otherwise:

1. Call `cstar_augury` with the current prompt, explicit target paths, scope, and bead id when known.
2. Call `cstar_handoff` to recover bounded active state when the MCP result points to a continuing session.
3. Call `cstar_hall_search` once with the intent, bead id, target path, or failure text.
4. Call `cstar_doctor` when the route, scope, expert, or target quality is degraded.
5. Inspect only the handoff targets, Mimir targets, and directly adjacent files needed for the task.

The local `./cstar augury ...` commands are operator recovery views over the
same kernel state, not a second routing authority. If MCP `cstar_augury` is
unavailable, the host must surface an unavailable state rather than infer its
own route or Council expert.

If `doctor.status` is `fail`, repair or recover the Augury contract before
editing or dispatching work. If it is `warn`, resolve the warning when it
affects scope, route, expert choice, or Mimir target quality.

## Field Meaning

- `scope`: `brain:CStar` means foundational engine work. `spoke:<name>` means a specific spoke is the target. Do not treat foundational CStar Augury work as spoke work.
- `route`: selected path in `<Intent Category> -> <SKILL|WEAVE|SPELL>: <selection>` form.
- `expert`: Council lens assigned to the task. Examples: `CARMACK` for game/performance work, `KARPATHY` for AI/model work, `SHANNON` for signal/observability/noise work.
- `expert_selection_reason`: why the canonical Council selector chose that expert.
- `expert_guardrails`: the selected expert's anti-behaviour constraints.
- `mimir`: bounded discovery targets. Prefer concrete files, directories, or Hall handles. More than three targets are prompt-noisy and should be narrowed.
- `confidence`: metadata for future learning. It must not be displayed in the prompt block as agent-facing instruction.
- `warnings`: routing risks. They are operational leads, not prose decorations.

## Prompt Budget Contract

The host prompt uses the full Augury once per stable session or planning key,
then lite Augury on later calls under that same key. Starting a new planning
key resets the mode to full even when the host session itself continues. Full
mode gives the exact MCP route, scope, intent, Mimir targets, expert lens,
guardrails, selection reason, optional signature question, Corvus standard, and
Gungnir status. Lite mode keeps only the minimum routing fields.

The sidecar formats only fields returned by MCP. It must never recompute a
route, choose a default expert, or silently replace a blocked/unavailable
result. Agents use Augury as routing context, not as text to echo back to the
user or write into source files.

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
