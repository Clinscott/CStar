---
name: taliesin-optimizer
description: "The Karpathy Auto-Researcher Loop. Improve manuscript prose while preserving a 90% fidelity floor."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: TALIESIN OPTIMIZER (v1.0)

## 💎 WHEN TO USE
Use when evolving manuscript prose through repeatable extraction, mutation, grading, and ledger cycles without violating the 90% fidelity floor.

## 🛠️ EXECUTION MODE
**Agent-Native**: The host owns qualitative grading, mutation, and adoption decisions.
**Bounded Support**: File extraction, deterministic fidelity scoring, and ledger persistence remain narrow kernel or script-side support tasks.

## 🧭 SUPERVISOR RULE
- Preserve the original intent and voice as the non-negotiable steel.
- Reject any candidate that falls below the 90% fidelity floor.
- Only adopt a mutation when the aggregate manuscript score improves over the current best.

## 🧩 SEQUENCE PROTOCOL
1. **Extract**: Pull the target chapter or segment from the canonical manuscript.
2. **Baseline**: Establish the current qualitative score across writing, entertainment, plot, and coherence.
3. **Mutate**: Rewrite only the weakest axis while preserving events and voice.
4. **Grade**: Re-score the mutation and enforce the fidelity gate.
5. **Ledger**: Persist the benchmark result and adopt only the superior candidate.
