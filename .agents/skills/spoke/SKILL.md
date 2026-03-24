---
name: spoke
description: "Use when managing the Corvus Star estate, linking external repositories (spokes), or unlinking them from the brain."
risk: safe
source: internal
---

# 🔱 SPOKE MANAGEMENT SKILL (v1.0)

## When to Use
- Use when mounting a new repository into the estate.
- Use when removing a repository that is no longer part of the active workspace.
- Use when listing all mounted repositories and their Gungnir scores.

## MANDATE
Maintain the integrity of the estate registry and provide seamless access to mounted spokes.

## LOGIC PROTOCOL
1. **PATH RESOLUTION**: Verify the target repository exists and is a valid C* or Git repository.
2. **REGISTRY UPDATE**: Update the `hall_mounted_spokes` table in PennyOne.
3. **SYNCHRONIZATION**: Trigger a scan of the new spoke to populate the Gungnir Matrix.
4. **LINKAGE**: Ensure the brain can resolve symbols and intents from the new spoke.

## USAGE
`cstar spoke link <slug> <path>`
`cstar spoke unlink <slug>`
`cstar spoke list`
