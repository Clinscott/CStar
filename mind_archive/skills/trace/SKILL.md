---
name: trace
description: "Corvus Star Augury [Ω] selection block. Classifies user intent and emits the canonical designation fields: Intent Category, Intent, Selection, Mimir's Well, Gungnir Verdict, and Confidence."
risk: safe
source: internal
---

# Corvus Star Augury [Ω]: Selection Block

## When to Use
- Use to resolve a user's request into the canonical Corvus Star Augury [Ω] designation block.
- Use when a host, agent, planning document, or handoff needs the fields that explain intent, selected execution path, supporting Mimir sources, Gungnir verdict, and confidence.

## Naming Boundary

**Corvus Star Augury [Ω]** means only the selection/designation block below.

It does **not** mean:

- JSON session traces
- telemetry traces
- execution beads
- trace visualization or replay
- Hall failure/status summaries
- `src/tools/trace_viz.py`

Those systems must use names such as **session trace**, **telemetry trace**, **execution trace**, or **trace visualization**. Do not call them "Corvus Star Augury" unless they are carrying this exact selection block.

Legacy compatibility: older documents may use `// Corvus Star Trace [Ω]`. Parsers may accept that header temporarily, but new content must use `// Corvus Star Augury [Ω]`.

## MANDATE
Classify the user's request into one of the 11 Intent Categories using the closed grammar. Do not guess; if the request is ambiguous, ask the user to clarify.

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
4. **EMIT**: Output the Corvus Star Augury [Ω] selection block before any tool calls.

## Corvus Star Augury [Ω] Format
```text
// Corvus Star Augury [Ω]
Intent Category: [REPAIR | BUILD | VERIFY | SCORE | OBSERVE | HARDEN | EXPAND | EVOLVE | ORCHESTRATE | GUARD | DOCUMENT]
Intent: [Brief goal statement]
Selection: [SKILL | WEAVE | SPELL]: [Name of the selected path]
Mimir's Well: ◈ [Primary File/Context] | ◈ [Secondary File/Context]
Gungnir Verdict: [L: X.X | S: Y.Y | I: Z.Z | Ω: XX%]
Confidence: [0.0 - 1.0]
```
