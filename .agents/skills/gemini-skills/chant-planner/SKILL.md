---
name: chant-planner
description: Natural language orchestration using the Plan-First and SET-Gate protocol. Use when you need to translate a user's high-level request into a detailed, phase-by-phase implementation roadmap before starting any work.
---

# 🔱 Chant Planner Skill [Ω]

This skill implements the "Plan-First" orchestration lifecycle, ensuring that all work is reviewed and "SET" by the operator before execution.

## Core Protocol: The Chant Weave

1.  **Global Plan**: Build a complete implementation graph (all phases and beads) for the user's request.
2.  **Phase Research**: For each phase, perform global architectural research (e.g., industry references, existing estate logic).
3.  **Bead Loop**: For every individual bead within a phase:
    - **Research**: Perform granular technical research for that specific task.
    - **Critique**: Apply an adversarial, high-fidelity critique to the proposed implementation.
    - **SET**: Present the researched and critiqued bead to the user for a "SET" dictate.
4.  **Orchestrate**: Once a batch of beads is marked as **SET**, the worker swarm (Hermes/AutoBot) may claim and implement them.

## The "SET" Gate

A bead is ONLY eligible for implementation once it has received an explicit "SET" dictate from the user. This ensures the operator remains the ultimate authority over architectural intent and implementation direction.

## Checklist for Planning
- Does the plan represent the "One Mind" alignment?
- Are the beads granular enough for the 32k context window?
- Is there a clear validation strategy for every bead?
