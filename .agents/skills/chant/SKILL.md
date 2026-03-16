---
name: chant
description: "Use when parsing natural-language chants into executable skill flight paths and routed execution plans."
risk: safe
source: internal
---

# 🔱 COGNITIVE CHANT SKILL (v1.0)

## When to Use
- Use when parsing natural-language chants into executable skill flight paths and routed execution plans.


## MANDATE
Parse natural language "Chants" into dynamic execution plans (Flight Paths) of Agent Skills. Act as the primary Cognitive Router for Huginn and Muninn.
Phase 1 authority: `cstar chant "<query>"` now resolves through the woven runtime.
The Python script in `scripts/chant.py` is a compatibility adapter only.
When a chant reaches implementation, `chant` must hand the active bead to `autobot`. `chant` remains the planner/router; AutoBot is the disposable worker.

## LOGIC PROTOCOL
1. **INTENT DECODING**: Consult the One Mind to translate the Shaman's chant into a series of technical objectives.
2. **SKILL MAPPING**: Identify the optimal sequence of Agent Skills required to fulfill the objectives.
3. **BEAD SHAPING**: Build beads for a constrained worker window. Only pass immediate context drawn from Hall and PennyOne: the active bead, target path, acceptance criteria, active critique, latest architect opinion, and the most recent episodic memory that changes the next edit.
4. **CEREMONIAL EXECUTION**: Trigger the `ritual` skill to visualize the plan, then hand implementation beads to `autobot` instead of a generic worker.
5. **MISSION FEEDBACK**: Monitor the success of each step and adjust the flight path if anomalies are detected.

## HANDOFF DISCIPLINE
- AutoBot is the default sub-agent for implementation handoff.
- Design beads for a 32k worker context window.
- Give AutoBot only the immediate facts required for the next edit.
- Prefer Hall/PennyOne summaries over broad repository narration.
- If critique is not the current task, do not spend context on critique history beyond the latest actionable point.

## USAGE
`cstar chant "<query>"`
