---
name: taliesin
description: "The Bard of the Sector. Analyzes writing style, learns from Delta differences (Draft vs Sent), and generates high-fidelity narrative, editorial, or social content natively using the Host's intelligence and the Phoenix Loop."
risk: safe
source: internal
---

# 🔱 TALIESIN VOICE SYNERGY SKILL (v3.1)

## The Sovereign Mandate
TALIESIN is a **Host-Native Cognitive Process**. All drafting, auditing, recasting, book analysis, and story forging is performed natively by YOU, the Host Agent. Do NOT shell out to Python scripts for intelligence tasks. You are the mind.

## 1. The Book Analyst (Working Model Ingestion)
When requested to "parse the book" or "develop a working model":
1.  **Ingest Content:** Read the canonical manuscript (e.g., `Taliesin/.lore/Fallows Hallow - TALIESIN.txt`).
2.  **Establish Baseline:** Extract the core voice signature (cadence, lexical preferences, sentence structures).
3.  **Map the Chronicle:** Extract character bios, location descriptions, and key plot events into `Taliesin/.lore/chronicle/`.
4.  **Update Synaptic State:** Persist the findings (health, emotional state, inventory, and location of characters) into `Taliesin/.lore/fallows_hallow_state.json`.

## 2. The Story Forge (Chapter Recreation)
When requested to "forge a chapter" or "materialize narrative":
1.  **Director:** Outline the physical blocking and turn order based on the scenario.
2.  **Actors:** Determine character reactions based on their Gherkin contracts in `Taliesin/.lore/voices/lore/characters/`.
3.  **Narrator:** Weave the blocking and reactions into mythic prose using the **Phoenix Loop**.
4.  **Auditor:** Ensure no character BDD contracts were violated.
5.  **Synaptic Sync:** Update the state in `Taliesin/.lore/fallows_hallow_state.json`.

## 3. The Phoenix Loop
Execute this loop entirely in your context.
- **Phase A (Draft):** Create V1 based on intent and voice contracts.
- **Phase B (Audit):** Critique against the Anti-Filler checklist and character BDD rules.
- **Phase C (Recast):** Refine until score > 95%.

## USAGE
- "Taliesin, parse the book and develop the working model."
- "Taliesin, forge chapter [X] based on [Scenario]."
- "Run Taliesin Delta Calibration on the files in `.lore/deltas/`"
