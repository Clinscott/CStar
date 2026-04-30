---
name: chronicle
description: "Use when building a high-fidelity system state map from documentation, code metadata, and behavioral contracts."
risk: safe
source: internal
---

# 🔱 CHRONICLE SKILL (v1.0)

## When to Use
- Use when building a high-fidelity system state map from documentation, code metadata, and behavioral contracts.


## MANDATE
The Librarian of the Hall of Records. Scrutinize the physical state of the system by aggregating documentation, code metadata, and behavioral contracts.

## CORE PRINCIPLES
1. **Deep Observation**: Scan beyond just files; analyze intents, imports, and exports.
2. **Behavioral Cross-Reference**: Verify that every skill has a matching Gherkin contract and PennyOne trace.
3. **High-Fidelity State**: Provide a mathematically backed state map of the entire framework.

## INTERFACE
`cstar chronicle --scan` - Initiates a deep system audit.
`cstar chronicle --map`  - Generates a high-fidelity JSON state map.

## HALL OF RECORDS
- **State Map**: `.agents/skills/chronicle/state_map.json`
- **History**: `dev_journal.qmd` (Tag: #Chronicle)
