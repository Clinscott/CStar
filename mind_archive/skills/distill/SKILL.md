---
name: distill
description: "Use when summarizing a completed task or git diff into a compact tactical summary for episodic memory."
risk: safe
source: internal
---

# 🔱 CONTEXT DISTILLER SKILL (v1.0)

## When to Use
- Use after completing a bead to summarize the changes.
- Use when preparing context for a new task to distill long logs into episodic memory.

## MANDATE
Distill complex technical changes into high-density tactical summaries using the One Mind.

## LOGIC PROTOCOL
1. **DIFF ACQUISITION**: Read the git diff or provided tactical summary of the changes.
2. **COGNITIVE DISTILLATION**: Invoke the One Mind to identify key architectural impacts and successes.
3. **EPISODIC STORAGE**: Write the resulting summary to the `hall_episodic_memory` table in PennyOne.
4. **LINKING**: Ensure the memory is correctly linked to the active Bead and Repository IDs.

## USAGE
Used automatically by the Orchestrator, or via:
`cstar distill`
`cstar orchestrate --distill`
