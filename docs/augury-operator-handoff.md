# Corvus Star Augury Operator Handoff

Status: ACTIVE

Next session runway: `NEXT_SESSION_AUGURY.md`

## Purpose

Corvus Star Augury [Ω] is the routing contract for an agentic turn. It tells an agent what path to take, why that path was selected, which Council expert lens applies, and where bounded evidence lives in Mimir's Well.

It is not a telemetry trace, execution trace, session log, Hall search result, or display-only artifact.

## Required Agent Order

Run from the CStar root unless an explicit spoke command says otherwise:

1. `cstar_doctor` through `cstar-kernel` MCP
2. `cstar_augury` with the bounded intent and target context
3. `cstar_handoff` when resuming prior work
4. One bounded `cstar_hall_search` for an intent, bead id, target path, or
   exact failure text when discovery is still needed
5. Inspect only the handoff targets, Mimir targets, and directly adjacent files needed for the task.

If `doctor.status` is `fail`, repair or recover the Augury contract before editing or dispatching work. If it is `warn`, resolve the warning when it affects scope, route, expert choice, or Mimir target quality.

## Field Meaning

- `scope`: `brain:CStar` means foundational engine work. `spoke:<name>` means a specific spoke is the target. Do not treat foundational CStar Augury work as spoke work.
- `route`: selected path in `<Intent Category> -> <SKILL|WEAVE|SPELL>: <selection>` form.
- `expert`: Council lens assigned to the task. Examples: `CARMACK` for game/performance work, `KARPATHY` for AI/model work, `SHANNON` for signal/observability/noise work.
- `mimir`: bounded discovery targets. Prefer concrete files, directories, or Hall handles. More than three targets are prompt-noisy and should be narrowed.
- `confidence`: legacy input only. Current Augury omits numeric confidence until
  an independently validated scorer supplies a real denominator, formula, row
  evidence, and provenance through a sanctioned kernel surface.
- `warnings`: routing risks. They are operational leads, not prose decorations.

## Prompt Budget Contract

The host prompt uses the full Augury once per session or planning key, then lite Augury on later calls. Full mode gives the route, scope, intent, Mimir targets, expert lens, guardrails, Corvus standard, work standard, trajectory, and verdict. Lite mode keeps only the minimum routing fields.

Agents should use Augury as routing context, not as text to echo back to the user.

## Learning Evidence

The former host-session JSONL writer is retired. Host formatting may compute
pure Augury metadata, but it does not append `.agents/state/augury-learning.jsonl`
or discover a writable CStar root. Measured observations enter only through a
named kernel-backed validation/telemetry surface such as `cstar_record_result`;
TokenPath observations remain quarantined until independently promoted.

Do not set up GEPA/DSPy during normal Augury operation. Historical ledger rows
are evidence only and grant no routing or promotion authority.

## Next Session Lead

The next high-value upgrade is a read-only usefulness evaluator over sanctioned,
provenance-bound observations and kernel lifecycle outcomes.

Acceptance contract: `docs/augury-usefulness-evaluator-contract.md`

Keep that evaluator read-only until the learning metric is proven stable.
