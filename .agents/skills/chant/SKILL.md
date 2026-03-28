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
Act as the primary entrypoint and session shell for Corvus Star. Parse natural language "Chants" into Hall-backed skill plans by delegating research, planning, and synthesis to specialized skills and weaves. Manage the collaborative session lifecycle and facilitate the handoff between planning and execution.
Phase 1 authority: `cstar chant "<query>"` resolves through the woven runtime.
Chant is the **shell**, not the **planner**. It orchestrates the flow:
1. **Routing**: Direct dispatch for known built-in capabilities.
2. **Session Lifecycle**: Create and resume collaborative planning sessions in the Hall.
3. **Scheduler Handoff**: Handoff validated bead graphs to the execution layer (e.g., `weave:autobot`).

## LOGIC PROTOCOL
1. **ROUTING**: Match query against built-in weaves (`ravens`, `pennyone`, `start`) and installed skills.
2. **SESSION BOOTSTRAP**: If no direct route matches, create or resume a planning session in the Hall.
3. **RESEARCH DELEGATION**: Activate the research skill to gather codebase and environmental facts.
4. **PLANNING DELEGATION**: Activate the architect/planner path to synthesize research and Hall truth into a structured bead graph.
5. **HUMAN ADJUDICATION**: Present proposals to the operator for review and approval (State: `PROPOSAL_REVIEW`).
6. **EXECUTION HANDOFF**: Release `SET` beads to `orchestrate`, which converts them into Hall skill activations (State: `FORGE_EXECUTION`).

## HANDOFF DISCIPLINE
- AutoBot is the default sub-agent for implementation handoff.
- Design beads for a 32k worker context window.
- Give AutoBot only the immediate facts required for the next edit.
- Prefer Hall/PennyOne summaries over broad repository narration.
- If critique is not the current task, do not spend context on critique history beyond the latest actionable point.

## USAGE
`cstar chant "<query>"`
