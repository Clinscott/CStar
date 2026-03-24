---
name: hall
description: "Use when searching the Hall of Records (Mimir), retrieving repository status, or querying intent-based file metadata."
risk: safe
source: internal
---

# 🔱 HALL SKILL (v1.0)

## When to Use
- Use when searching the repository for specific capabilities or intents.
- Use when retrieving the current status of the Hall of Records or Gungnir scores.

## MANDATE
Provide high-fidelity access to the Well of Mimir and the Gungnir Matrix scores.

## LOGIC PROTOCOL
1. **QUERY RESOLUTION**: Identify if the user is searching for a path, an intent, or a general capability.
2. **DATABASE DISPATCH**: Query the PennyOne SQLite database (hall_files / intents_fts).
3. **SOVEREIGNTY RANKING**: Sort results by Gungnir score and relevance.
4. **PRESENTATION**: Render the findings via the Sovereign HUD.

## USAGE
`cstar hall <query>`
`cstar hall --status`
