---
name: orchestrate
description: "Use when initiating an autonomous restoration cycle, processing SET beads, and managing the swarm execution loop."
risk: safety-critical
source: internal
---

# 🔱 ORCHESTRATOR SKILL (v1.1)

## When to Use
- Use when starting the automated restoration of the estate.
- Use when processing a backlog of Linscott Breaches or technical debt beads.

## MANDATE
Govern the estate skill scheduler. Hall beads are the work ledger, skill activations are the execution primitive, and host differences must be reduced to thin activation adapters.
Treat parent beads as coordination contracts that must shatter into bounded child beads before skill activation.

## LOGIC PROTOCOL
1. **BEAD ACQUISITION**: Identify released `SET` beads from the PennyOne Hall DB.
2. **PARENT SHATTERING**: If the bead is a parent or wide planning/state bead, shatter it into bounded child beads and keep the parent unresolved until the children complete.
3. **CAPABILITY ROUTING**: Map each executable child bead to the right skill and role before any host-specific transport is considered.
4. **ACTIVATION LEDGER**: Persist a Hall skill-activation record for each dispatched child bead.
5. **SWARM DISPATCH**: Execute the mapped skill for that child bead and keep the Hall activation record synchronized with reality.
6. **VERIFICATION GATE**: Run the Triad of Verification (feature, unit test, gungnir).
7. **EPISODIC COMMIT**: Record the tactical summary and transition the bead to the next review state.

## USAGE
`cstar orchestrate --limit 5 --parallel 3`
