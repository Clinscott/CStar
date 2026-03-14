---
name: trace
description: "Use when rendering and analyzing neural trace artifacts for replay, conflict review, and live monitoring."
risk: safe
source: internal
---

# 🔱 NEURAL TRACE VISUALIZATION SKILL (v1.0)

## When to Use
- Use when rendering and analyzing neural trace artifacts for replay, conflict review, and live monitoring.


## MANDATE
Render and analyze the neural path of triggered intents, providing high-fidelity visual replay and conflict analysis (War Room).

## LOGIC PROTOCOL
1. **TRACE REPLAY**: Load and render JSON trace artifacts into the Sovereign HUD.
2. **NEURAL PATH MAPPING**: Chronological flowchart generation of triggered intents.
3. **CONFLICT ANALYSIS**: Identify "War Room" discrepancies between agent personas (ODIN vs. ALFRED).
4. **LIVE MONITORING**: Real-time rendering of query expansion and token weight signals.

## USAGE
`cstar trace --query <text>`
`cstar trace --file <path>`
`cstar trace --war-room`
