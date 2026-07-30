---
name: calculus
description: "Use for deterministic, read-only heuristic scoring or auditing of one supported source file."
tier: PRIME
risk: safe
intent_category: SCORE
entry_surface: compatibility
terminal_required: false
---

# Gungnir Calculus

Gungnir Calculus is an internal compatibility library for deterministic source
analysis. It is discoverable through the skill registry, but it is not
registered in the default `cstar` command catalog or retired Node dispatcher.
Callers must deliberately import the command or adapter surface.

## Contract

- Resolve one file within an explicitly selected workspace.
- Reject lexical escapes, symlink escapes, directories, missing files, and
  unsupported extensions.
- Return a deterministic canonical Gungnir matrix, ordered breach evidence,
  and an explicit `heuristic` coverage label.
- Treat the matrix as evidence only. It is not a lifecycle result, benchmark,
  production score, merge decision, or `metrics_delta`.

## Invariants

- Read source only; never write source, Hall, StateRegistry, `.stats`, reports,
  generated artifacts, configuration, or secrets.
- Never invoke a model, network service, subprocess, skill, weave, delegate, or
  lifecycle transition.
- Remain a leaf capability.
- Compatibility discovery does not authorize runtime registration or widen the
  default operator catalog.
