---
name: manifest
description: "Use when listing registered Agent Skills and runtime Weaves, or inspecting the mandate of a specific skill."
risk: safe
source: internal
---

# 🔱 MANIFEST SKILL (v1.0)

## When to Use
- Use to see all available capabilities in the Corvus Star ecosystem.
- Use to read the mandate, protocol, and usage instructions for a specific skill.

## MANDATE
Maintain and expose the authoritative registry of all agentic capabilities.

## LOGIC PROTOCOL
1. **MANIFEST LOOKUP**: Read the `skill_registry.json` from the `.agents` directory.
2. **RUNTIME SYNC**: Query the `RuntimeDispatcher` to identify which skills have active weave adapters.
3. **MANDATE RETRIEVAL**: Locate and read the `SKILL.md` for a requested capability.
4. **STATUS RENDERING**: Display skills with their authentication and active status (ACTIVE/LOADED).

## USAGE
`cstar manifest`
`cstar skill-info <id>`
