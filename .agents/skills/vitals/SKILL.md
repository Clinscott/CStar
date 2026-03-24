---
name: vitals
description: "Use when retrieving system health metrics, resource usage (CPU/RAM), or the current status of the agentic mission."
risk: safe
source: internal
---

# 🔱 SYSTEM VITALS SKILL (v1.0)

## When to Use
- Use when checking if the system is healthy.
- Use when debugging resource leaks or performance issues.
- Use to retrieve the current MISSION ID and active persona status.

## MANDATE
Provide real-time, high-fidelity monitoring of the Corvus Star spine and agentic heartbeat.

## LOGIC PROTOCOL
1. **SENSOR READ**: Query the host operating system for RAM, Disk, and CPU metrics.
2. **HEARTBEAT FETCH**: Retrieve the current framework status from the State Registry.
3. **COMPLIANCE CHECK**: Calculate the current estate coverage and Gungnir Ω score.
4. **HUD RENDER**: Format the data for display in the Sovereign HUD.

## USAGE
`cstar vitals`
`cstar status` (alias)
