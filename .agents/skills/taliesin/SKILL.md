---
name: taliesin
description: "The Bard of the Sector. Analyzes writing style and generates high-fidelity narrative, editorial, or social content through an interactive Q&A process and the Phoenix Loop."
risk: safe
source: internal
---

# 🔱 TALIESIN VOICE SYNERGY SKILL (v2.1)

## The Sovereign Mandate
TALIESIN is a conversational **Process**. It collects narrative intent through a guided Q&A (The Seer's Chamber) and refines the output until it reaches >95% style cohesion.

## Interactive Workflow (The Seer's Chamber)
When invoked without a formatted chant, TALIESIN will prompt for:
1.  **MODE**: Story, Blog, or Social.
2.  **INTENT**: The core message or goal.
3.  **BLOCKING**: Key events, physical movements, or structural beats.
4.  **ANCHORS**: Specific words or phrases to anchor the style (EAS).
5.  **BANS**: Words or patterns to strictly avoid (NDS).

## Internal Workflow: The Phoenix Loop
1.  **Drafting**: Generates a V1 based on the collected intent and the Voice Contract.
2.  **Auditing**: Automatically critiques the draft for generic AI patterns or style drift.
3.  **Recasting**: Iteratively refines the prose until the internal Cohesion Score > 95%.

## USAGE
`cstar taliesin` (Enters the interactive Seer's Chamber)
`cstar taliesin "learn"` (Extracts style from .lore/samples/)
`cstar taliesin "[MODE]: ... [INTENT]: ..."` (Legacy bypass for automated pipelines)
