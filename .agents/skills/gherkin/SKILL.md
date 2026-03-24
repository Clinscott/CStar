---
name: gherkin
description: "Use when creating, validating, or managing Gherkin .feature contract files for behavior-driven development."
tier: SKILL
risk: safe
source: internal
---

# 🔱 GHERKIN: BEHAVIORAL CONTRACT MANAGEMENT (v1.0)

## When to Use
- Use when creating new Gherkin `.feature` files for the Empire TDD protocol.
- Use when validating existing contracts against implementation code.
- Use when the Sterling Mandate requires Lore (Tier 1) verification.

## MANDATE
Manage the lifecycle of Gherkin behavioral contracts that enforce the Sterling Mandate's Lore requirement.

## LOGIC PROTOCOL
1. **CONTRACT DISCOVERY**: Locate existing `.feature` files in `tests/features/` and `tests/empire_tests/`.
2. **VALIDATION**: Cross-reference feature scenarios against implementation code to detect drift.
3. **GENERATION**: Create new `.feature` contracts from implementation intent.
4. **COVERAGE AUDIT**: Report which components lack behavioral contracts.

## USAGE
`cstar gherkin --audit`
`cstar gherkin --generate --target <path>`
