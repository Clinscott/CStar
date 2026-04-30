---
name: critique
description: "Use when adversarial review, regression analysis, or plan stress-testing is required."
risk: medium
source: internal
---

# CRITIQUE

## Mandate
Stress-test a proposed bead, implementation path, or architectural change against current Hall truth and code reality.
Critique is a host-native reasoning surface. The kernel may record requests and outputs, but it does not own the judgment.

## Rules
1. Surface concrete findings first.
2. Tie each finding to evidence from code, Hall state, or stated constraints.
3. Prefer bounded corrective direction over abstract objections.
4. If no material flaw exists, state that explicitly and note residual risk.

## Outputs
- `needs_revision`: whether the current path should change
- `critique`: concise adversarial assessment
- `evidence_source`: the code, Hall, or contract source that supports the finding
- `proposed_path`: the safer bounded direction when revision is needed
