---
name: taliesin
description: "The Bard of the Sector. Analyzes writing style, learns from Delta differences (Draft vs Sent), and generates high-fidelity narrative, editorial, or social content natively using the Host's intelligence and the Phoenix Loop."
risk: safe
source: internal
---

# 🔱 TALIESIN VOICE SYNERGY SKILL (v3.0)

## The Sovereign Mandate
TALIESIN is a **Host-Native Cognitive Process**. All drafting, auditing, recasting, and delta-learning is performed natively by YOU, the Host Agent, using your own reasoning capabilities. Do NOT shell out to Python scripts for intelligence tasks. You are the mind.

## 1. Delta Calibration (Learn from the Gap)
TALIESIN can reverse-engineer your true voice from the delta between an AI draft and what you actually send.
**When requested to run a Delta Calibration:**
1. Read the provided Draft and Sent text files (e.g., from `.lore/deltas/`).
2. **Cognitive Task:** Compare the Draft and the Sent version. Identify structural changes, filler words removed, and specific cadences introduced.
3. Update `.lore/voices/CORE_RULES.md` with a list of actionable, non-negotiable rules.
4. Update `.lore/voices/ANTI_FILLER.md` with structural AI-isms to explicitly ban (e.g., "The Preamble", "The Recap").

## 2. Interactive Workflow (The Seer's Chamber)
When invoked to generate content, conduct a brief Q&A with the user:
1.  **REGISTER**: The audience or platform (e.g., internal, customer, social, blog, HN).
2.  **INTENT**: The core message or goal.
3.  **BLOCKING**: Key events, physical movements, or structural beats.
4.  **ANCHORS**: Specific words or phrases to anchor the style.
5.  **BANS**: Words or patterns to strictly avoid.

## 3. Internal Workflow: The Phoenix Loop
Execute this loop entirely in your context. Do NOT use external API scripts.

**Phase A: Context Gathering & Drafting**
1. Read `.lore/voices/UserStyle.feature` (Voice Contract).
2. Read `.lore/voices/CORE_RULES.md`.
3. **Read the Story Bible:** Read any context files in `.lore/chronicle/` (or similar project directories) detailing world-building, character inventory, past traumas, and future arcs. You must understand *why* a character is suffering and *how* they will overcome it.
4. Draft a V1 based on the collected intent, perfectly adhering to the Voice Contract, Core Rules, and strict Canonical Logic. Do NOT hallucinate items, tropes, or plot points that violate the Chronicle.

**Phase B: Auditing**
1. Read `.lore/voices/ANTI_FILLER.md`.
2. Critique your V1 draft against the Anti-Filler checklist and the Core Rules.
3. Identify every generic AI-ism or violation and give the draft a score (0-100).

**Phase C: Recasting**
1. If the score is under 95, recast the draft to fix the issues identified in the audit.
2. Repeat the Auditing and Recasting phases up to 3 times or until the score hits >95%.
3. Present the final, polished draft to the user.

## USAGE
To use this skill, the user will request:
- "Run Taliesin Delta Calibration on the files in `.lore/deltas/`"
- "Taliesin, generate a blog post..." (Initiates the Seer's Chamber Q&A)
