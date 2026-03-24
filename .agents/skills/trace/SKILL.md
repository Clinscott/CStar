---
name: trace
description: "The Neural Selection Gate. Analyzes prompts via the Intent Grammar to select the optimal tier of execution: Skill, Weave, or Spell."
risk: safe
source: internal
---

# 🔱 TRACE: THE NEURAL SELECTION GATE (v3.0)

## When to Use
- **MANDATORY**: Must precede every agentic response.
- Use to resolve a user's intent into the most potent execution Tier.

## MANDATE
Classify the user's request into one of the 11 Intent Categories using the closed grammar. Do not guess — if the request is ambiguous, ask the user to clarify.

## THE INTENT GRAMMAR (The Prompt Compiler)
Every request maps to **exactly one** category:

| Category | Trigger Words | Default Path | Tier |
|:---|:---|:---|:---|
| `REPAIR` | fix, repair, heal, restore, broken, failing, bug | `restoration` | WEAVE |
| `BUILD` | build, create, scaffold, implement, new, add, feature | `creation_loop` | WEAVE |
| `VERIFY` | test, verify, validate, check, assert, spec | `empire` | SKILL |
| `SCORE` | score, grade, rate, audit, quality, gungnir | `calculus` | PRIME |
| `OBSERVE` | scan, search, find, query, status, health, look, show | `scan` / `mimir` / `status` | PRIME |
| `HARDEN` | contract, comply, sterling, harden, gherkin | `contract_hardening` | WEAVE |
| `EXPAND` | deploy, link, mount, spoke, onboard | `expansion` | WEAVE |
| `EVOLVE` | optimize, refactor, evolve, improve | `evolve` | WEAVE |
| `ORCHESTRATE` | plan, dispatch, autobot, orchestrate | `orchestrate` | WEAVE |
| `GUARD` | protect, shield, lock, guard, drift | `silver_shield` | SPELL |
| `DOCUMENT` | document, explain, chronicle, architecture | `living_architecture` | WEAVE |

## LOGIC PROTOCOL
1. **CLASSIFY**: Match the user's request against the Intent Grammar trigger words.
2. **SELECT**: Use the matched category's Default Path and Tier.
3. **CONTEXT**: Identify the target files/sectors from the user's request.
4. **EMIT**: Output the Trace [Ω] block before any tool calls.

## TRACE FORMAT [Ω]
```text
// Corvus Star Trace [Ω]
Intent Category: [REPAIR | BUILD | VERIFY | SCORE | OBSERVE | HARDEN | EXPAND | EVOLVE | ORCHESTRATE | GUARD | DOCUMENT]
Intent: [Brief goal statement]
Selection: [SKILL | WEAVE | SPELL]: [Name of the selected path]
Mimir's Well: ◈ [Primary File/Context] | ◈ [Secondary File/Context]
Gungnir Verdict: [L: X.X | S: Y.Y | I: Z.Z | Ω: XX%]
Confidence: [0.0 - 1.0]
```
