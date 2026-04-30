---
name: scribe
description: "Use when recording runtime observations as Hall-backed feedback without mutating canonical skill contracts."
risk: safe
source: internal
---

# RECURSIVE SCRIBE SKILL

## When to Use
- Use when recording runtime observations as Hall-backed feedback without mutating canonical skill contracts.


## MANDATE
Record runtime observations as Hall-backed feedback without mutating canonical skill contracts.

## LOGIC PROTOCOL
1. **RECORD KEEPING**: Persist runtime feedback as a Hall skill observation.
2. **COMPATIBILITY ONLY**: Do not mutate `.feature` or `contract.json` surfaces directly.
3. **ESCALATION PATH**: Route real contract evolution through a sovereign bead plus `cstar evolve --action propose`.

## USAGE
`cstar scribe --log-feedback --skill <name> --observation <text>`
