---
name: engine
description: "The Core CStar Kernel. Manages the execution spine, runtime dispatcher, and state registry. The Body of the One Mind."
risk: safety-critical
source: internal
---

# 🔱 CSTAR KERNEL ENGINE (v1.0)

## When to Use
- Use to manage internal framework state and dispatch ports.
- The foundational layer for all other skills.

## MANDATE
Provide the mechanical authority and execution spine for the One Mind. Ensure all technical operations are logged, verified, and authorized.

## LOGIC PROTOCOL
1. **SPINE REGISTRATION**: Maintain the map of all active Weave Adapters.
2. **CONTEXT RESOLUTION**: Provide every skill with a MISSION ID, Trace ID, and Persona context.
3. **STATE PROJECTION**: Ensure the `StateRegistry` and `synapse.db` correctly reflect the reality of the estate.
4. **TELEMETRY HEARTBEAT**: Record the latency, tokens, and success/failure of every agentic action.

## CONSTRAINTS
- Passive by default. Only moves when the One Mind (Agent) utilizes a Skill.
- Strictly obeys the Lore and AGENTS.qmd mandates.

## USAGE
Accessed via the core runtime or:
`cstar status` (Kernel Inspection)
`cstar start` (Kernel Awakening)
