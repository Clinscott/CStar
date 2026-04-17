# Augury Usefulness Evaluator Contract

Status: PROPOSED

## Purpose

Build a read-only evaluator that tells agents and future GEPA/DSPy work whether Corvus Star Augury routing is actually useful.

The evaluator must measure route quality from existing records. It must not mutate prompts, rewrite contracts, dispatch agents, or start optimizer work.

## Command Shape

Suggested command:

```bash
./cstar augury metrics --json
```

Human output may exist, but JSON is the contract surface.

## Inputs

- `.agents/state/augury-learning.jsonl`
- Hall planning session records
- Runtime execution bead records
- `augury_contract`
- `augury_learning_metadata`
- `trace_contract` only as a legacy mirror

Missing input files must return an empty, successful report with warnings, not a crash.

## Required JSON Sections

- `summary`: totals, analyzed rows, skipped rows, warning count.
- `by_scope`: quality grouped by `brain:CStar` and `spoke:<name>`.
- `by_route`: quality grouped by `selection_tier` and `selection_name`.
- `by_expert`: quality grouped by Council expert id/label.
- `by_mimir`: quality grouped by target count and omitted count.
- `by_confidence`: quality grouped by `confidence_source`.
- `by_steering_mode`: quality grouped by `full` and `lite`.
- `warnings`: deterministic warnings for missing contracts, vague targets, missing experts, or unjoined outcomes.

## Metric Shape

Every grouped metric row should use this stable shape:

```json
{
  "key": "brain:CStar",
  "total": 3,
  "useful": 2,
  "failed": 1,
  "unjoined": 0,
  "warnings": 1,
  "usefulness_rate": 0.6667
}
```

Rules:

- `key` is the grouping value.
- `total` is every ledger or joined record in the group.
- `useful` is the count passing the v1 quality signals.
- `failed` is the count with joined failure or failed terminal status.
- `unjoined` is the count with no matching Hall/runtime outcome.
- `warnings` is the count of deterministic quality warnings in the group.
- `usefulness_rate` is `useful / total`, rounded to four decimals. Use `0` when `total` is `0`.

Minimal JSON skeleton:

```json
{
  "schema_version": 1,
  "generated_at": null,
  "summary": {
    "total": 0,
    "analyzed": 0,
    "skipped": 0,
    "warnings": 0
  },
  "by_scope": [],
  "by_route": [],
  "by_expert": [],
  "by_mimir": [],
  "by_confidence": [],
  "by_steering_mode": [],
  "warnings": []
}
```

## Quality Signals

Use only deterministic local signals for v1:

- Planning status reached `PLAN_READY`, `COMPLETED`, or runtime status `RESOLVED`.
- No active failure diagnostics are attached to the joined session/bead.
- Mimir target count is between 1 and 3.
- Scope is explicit and not contradictory.
- Council expert exists when the route has clear domain signals.

Do not use model judgment in v1.

## Acceptance Criteria

- Read-only: no writes except optional explicit test fixtures.
- Deterministic: same inputs produce byte-stable JSON except timestamps if explicitly requested.
- Bounded: no broad local scans; use Hall records and the Augury learning ledger.
- Compatible: legacy `trace_contract` may be read, but output names must use Augury language.
- Tested: include unit coverage for empty ledger, clean joined outcome, missing Mimir target, vague Mimir target, and full-vs-lite grouping.

## Non-Goals

- No GEPA/DSPy setup.
- No prompt mutation.
- No automatic expert reassignment.
- No new shell wrappers.
- No spoke inference unless `target_domain` or `spoke_name` is explicit.
