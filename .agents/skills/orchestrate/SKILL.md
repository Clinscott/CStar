---
name: orchestrate
description: "Use when initiating an autonomous restoration cycle, processing SET beads, and managing the swarm execution loop."
risk: safety-critical
source: internal
---

# 🔱 ORCHESTRATOR SKILL (v1.0)

## When to Use
- Use when starting the automated restoration of the estate.
- Use when processing a backlog of Linscott Breaches or technical debt beads.

## MANDATE
Govern the autonomous execution spine, ensuring every change is verified through Lore, Isolation, and Audit.

## LOGIC PROTOCOL
1. **BEAD ACQUISITION**: Identify 'SET' status beads from the PennyOne Hall DB.
2. **ENVIRONMENT ISOLATION**: Prepare a clean runtime context for the task.
3. **SWARM DISPATCH**: Execute the implementation weave (e.g., Taliesin, Evolve) for the bead.
4. **VERIFICATION GATE**: Run the Triad of Verification (feature, unit test, gungnir).
5. **EPISODIC COMMIT**: Record the tactical summary and transition the bead to 'RESOLVED'.

## USAGE
`cstar orchestrate --limit 5 --parallel 3`
