---
name: agentic-ingest
description: "Direct One Mind conduit for recording file intelligence into the Hall of Records."
risk: safe
source: internal
---

# 🔱 SKILL: AGENTIC INGEST (v1.0)

## 💎 WHY TO USE
Use to manually record intent and interaction summaries for a file when the automated PennyOne scan is insufficient or quota-limited.

## 🛠️ HOW TO USE
Invoke the Python ingest script directly with the required metadata.

## 📥 SIGNATURE (API)
**Command**: `python3 .agents/skills/one-mind/scripts/ingest.py <path> <intent> <interaction>`

**Arguments**:
*   `path` (string): The absolute path to the target sector.
*   `intent` (string): High-fidelity description of the file's purpose (2-3 sentences).
*   `interaction` (string): How this sector interacts with other components (1-2 sentences).

**Output**:
*   Direct update to `hall_files` table in `.stats/pennyone.db`.
*   [ALFRED] success/failure log.

## 📁 FILEPATH
- **Mandate**: `.agents/skills/agentic-ingest/SKILL.md`
- **Script**: `.agents/skills/one-mind/scripts/ingest.py`
