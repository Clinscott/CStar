---
name: taliesin-optimizer
description: "The Karpathy Auto-Researcher Loop for manuscript optimization. Improves prose across multiple axes while enforcing a 90% fidelity floor."
risk: safe
tier: WEAVE
---

# 🔱 TALIESIN OPTIMIZER SKILL (v1.0)

## Overview
The Taliesin Optimizer is a host-native implementation of the Karpathy Loop. It systematically improves manuscript prose by iterating through **Extract -> Mutate -> Grade -> Ledger** cycles.

## MANDATE
Act as the **Architect and Auditor** of the manuscript. You must not blindly rewrite; you must evolve the prose while preserving the "Steel" of the original intent and voice.
- **Host Responsibility**: Orchestration, Mutation (Inference), and Qualitative Grading (Inference).
- **Kernel Responsibility**: File I/O, Deterministic Fidelity Scoring (Set Intersection), and Ledger Persistence.

## OPERATIONAL PROTOCOL (THE KARPATHY LOOP)

### 1. EXTRACTION (STEEL)
- Use `Taliesin/scripts/manuscript_optimizer.py` or direct file reads to extract the target chapter/segment from the master manuscript.
- **Target**: `CStar/.lore/samples/Fallows Hallow - TALIESIN.txt`

### 2. BASELINE ESTABLISHMENT (HOST)
- Analyze the extracted text to establish a qualitative baseline.
- **Axes**: Writing Skill, Entertainment Value, Plot Devices, Story Coherence.
- **Output**: JSON baseline stored in `Taliesin/.state/taliesin-optimizer/global_golden_baseline.json`.

### 3. MUTATION (HOST INFERENCE)
- Identify the weakest axis from the current audit.
- **Action**: Rewrite the prose to improve the weakest axis.
- **Constraint**: Maintain the established Voice Signature and Story Events.

### 4. GRADING & FIDELITY GATE (HOST + STEEL)
- **Qualitative Grade (Host)**: Re-score the mutated prose against the baseline.
- **Deterministic Fidelity (Steel)**: Calculate word-set intersection between candidate and original.
- **GATE**: If `Fidelity < 90.0%`, the mutation is **REJECTED**.

### 5. LEDGERING (STEEL)
- Persist the results of each iteration to `Taliesin/.state/taliesin-optimizer/benchmark_ledger.json`.
- Only **ADOPT** the mutation if `Average Score > Previous Best`.

## USAGE
The host executes this loop by calling the underlying Python primitives for "Steel" operations while performing all "Thinking" operations via direct host inference.

```bash
# Example Kernel-side support call for extraction
python3 Taliesin/scripts/manuscript_optimizer.py --chapter Prologue --extract-only
```

## VERIFICATION
- Successful loop completion results in an optimized file in `CStar/.lore/optimized/`.
- Fidelity must never drop below the 90% floor.
