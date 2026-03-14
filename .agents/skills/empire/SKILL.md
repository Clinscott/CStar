---
name: empire
description: "Use when verifying code artifacts against Gherkin contracts and strict companion test suites under the Empire TDD protocol."
risk: safe
source: internal
---

# 🔱 EMPIRE TDD SKILL (v1.0)

## When to Use
- Use when verifying code artifacts against Gherkin contracts and strict companion test suites under the Empire TDD protocol.


## MANDATE
Enforce the Empire TDD Protocol by verifying code artifacts against Gherkin behavioral contracts and strict companion test suites.

## LOGIC PROTOCOL
1. **CONTRACT DISCOVERY**: Locate the relevant Gherkin contract (`.qmd`) or `.feature` file for the target sector.
2. **HARNESS EXECUTION**: Trigger the Empire Test Suite (pytest-bdd) to verify behavioral adherence.
3. **REGRESSION ANALYSIS**: Identify failing scenarios and report them to the Gungnir Calculus.
4. **SOVEREIGNTY VERIFICATION**: Ensure 100% test coverage before allowing skill or artifact promotion.

## USAGE
`cstar empire --test --file <path>`
`cstar empire --verify-contract <path>`
