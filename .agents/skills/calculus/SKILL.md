---
name: calculus
description: "Use when deterministically scoring or auditing one supported source file with the canonical Gungnir matrix."
tier: PRIME
risk: safe
intent_category: SCORE
entry_surface: cli
terminal_required: false
---

# Gungnir Calculus

Use this read-only TypeScript kernel primitive for deterministic heuristic source analysis. It does not run benchmark SPRT, mutate the framework score, or decide merge readiness.

## Usage

```text
cstar calculus score <file> [--json]
cstar calculus audit <file> [--json]
```

## Contract

- Resolve one file within the selected workspace; reject escapes, directories, missing files, and unsupported extensions.
- Return a canonical-schema zero-to-ten Gungnir matrix, deterministic ordered breach evidence, and an explicit `heuristic` coverage label.
- Use `--json` for stable machine-readable output without timestamps or ambient state.
- Treat audit breaches as evidence with exit status `2`; invalid execution fails with status `1`.

## Invariants

- Read source only; never write source, Hall, StateRegistry, `.stats`, or generated artifacts.
- Never invoke a model, network service, subprocess, skill, weave, or delegate.
- Return the matrix as output evidence, never `metrics_delta`.
- Remain a leaf capability.
