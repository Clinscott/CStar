# Next Session: Corvus Star Augury

Status: READY

## Two-Minute Start

If time is tight, do only this:

```bash
cd /home/morderith/Corvus/CStar
./cstar augury doctor --json
```

If the doctor passes, start the read-only evaluator from `docs/augury-usefulness-evaluator-contract.md`. If it fails, repair Augury health before touching anything else.

## Current Verified State

Corvus Star Augury [Ω] is the active routing contract for CStar agent turns. It is distinct from telemetry traces, execution traces, session logs, and Hall search output.

Verified at handoff:

- `./cstar augury doctor --json` returned `pass`, score `100`, scope `brain:CStar`, no warnings.
- `./cstar augury explain --json` returned an available Augury with route, scope, expert, Mimir, mode, confidence, and no warnings.
- Codex plugin contains `augury doctor`, `augury explain`, and `augury handoff`.
- Gemini extension symlink resolves to `/home/morderith/Corvus/CStar`.

## First Commands

Run exactly from the CStar root:

```bash
cd /home/morderith/Corvus/CStar
./cstar augury doctor --json
./cstar augury explain --json
./cstar augury handoff --json
./cstar hall "Augury usefulness evaluator learning metadata"
```

Read next:

- `docs/augury-operator-handoff.md`
- `docs/augury-usefulness-evaluator-contract.md`
- `docs/trace-naming-contract.md`
- `src/core/host_session.ts`
- `src/core/host_intelligence.ts`
- `src/node/core/commands/trace.ts`

## Next Implementation Target

Build a read-only Augury usefulness evaluator.

The evaluator should answer:

- Which routes produce useful outcomes?
- Which Council experts correlate with successful outcomes by domain?
- How often do Mimir targets give agents enough bounded context?
- Does full-first/lite-after steering stay useful over repeated host calls?
- Does confidence source predict route quality?

## Inputs

Use existing data only:

- `.agents/state/augury-learning.jsonl`
- Hall planning session records
- Runtime execution bead records
- `augury_contract`
- `augury_learning_metadata`
- `trace_contract` only as a compatibility mirror

## Output Shape

Prefer JSON first, then a compact human summary:

- route quality by `scope`
- route quality by `expert`
- route quality by `selection_tier` and `selection_name`
- Mimir usefulness by target count and omitted count
- confidence quality by `confidence_source`
- prompt usefulness by `steering_mode` (`full` vs `lite`)
- warnings for missing or vague Mimir targets

## Hard Bans

- Do not set up GEPA/DSPy yet.
- Do not let evaluator output mutate prompts.
- Do not rename Augury again.
- Do not call Augury a trace.
- Do not treat CStar foundational work as a spoke.
- Do not use broad local scans before Hall/Mimir discovery.
- Do not add shell wrappers for host-native skills.

## Success Bar

The first evaluator version is successful if it is read-only, deterministic, tested, and gives future GEPA/DSPy work a stable dataset view without changing runtime behavior.
