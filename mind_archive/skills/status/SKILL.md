---
name: status
description: "Use when retrieving system vitals, framework state, mission progress, and estate matrix reports."
risk: safe
source: internal
---

# 🔱 STATUS SKILL (v1.0)

## When to Use
- Use to see the current MISSION ID, active persona, and gungnir scores.
- Use to check the state of all mounted estate spokes.

## MANDATE
Provide a high-fidelity snapshot of the current framework integrity and agentic activity.

## LOGIC PROTOCOL
1. **STATE SNAPSHOT**: Query the State Registry for current framework and mission data.
2. **RESUME CHECK**: Attempt to resume the host governor if governed validation is active.
3. **COMPLIANCE AUDIT**: Read the Chronicle state map to determine contract coverage.
4. **MATRIX RENDERING**: List all mounted spokes and their current mount status (active/pending/offline).

## USAGE
`cstar status`
