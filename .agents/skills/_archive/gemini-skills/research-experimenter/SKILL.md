---
name: research-experimenter
description: Autonomous, fixed-budget optimization of target logic. Use when you need to run iterative experiments (mutations) against a target file to improve its performance or reliability within a strict time limit (The Karpathy Standard).
---

# 🔱 Research Experimenter Skill [Ω]

This skill implements the "Karpathy Standard" for autonomous optimization through bounded experimentation.

## Core Mandates

1.  **The Crucible**: Every experiment is bound by a fixed time budget (default: 300s).
2.  **Fixed Evaluation**: The metric and test environment are immutable constants.
3.  **Hypothesis First**: You MUST document a hypothesis before making a code change.
4.  **Neuralplastic Evolution**: Successes are only accepted if they show a statistically significant improvement (use `sprt-verifier`).

## Workflow

1.  **Hypothesize**: Identify a specific improvement (e.g., "Add skip connections to improve gradient flow").
2.  **Mutate**: Modify the target file (the "mutable genome").
3.  **Train/Test**: Run the evaluation loop for the fixed budget duration.
4.  **Evaluate**: Analyze the resulting metric (e.g., validation loss, bits-per-byte).
5.  **Commit/Reset**: If the metric improves and is stable, keep the change. Otherwise, reset to the last known-good state.

## Checklist for Optimization
- Is the change simple enough for the 32k context window?
- Can the improvement be measured in a 5-minute window?
- Is there a clear baseline to compare against?
