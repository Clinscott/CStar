---
name: mimir
description: "Use when querying the Well of Mimir for deep semantic search across the Hall of Records and repository intelligence."
tier: PRIME
risk: safe
source: internal
---

# 🔱 MIMIR: THE WELL OF KNOWLEDGE (v1.0)

## When to Use
- Use when performing semantic search across the repository's indexed intelligence.
- Use when querying file intent, interaction protocols, or structural metadata.
- Use when the Hall of Records needs deep, ranked retrieval.

## MANDATE
Provide the deepest layer of repository intelligence through ranked semantic search over the PennyOne database.

## LOGIC PROTOCOL
1. **QUERY PARSING**: Decompose the search intent into tokens and semantic anchors.
2. **FTS5 SEARCH**: Execute full-text search against `hall_files` and `intents_fts` tables.
3. **SOVEREIGNTY RANKING**: Sort results by Gungnir score, relevance, and recency.
4. **CONTEXT SYNTHESIS**: Return structured results with intent, interaction protocol, and score data.

## USAGE
Accessed via MCP (`search_by_intent`) or CLI:
`cstar hall <query>` (via Hall skill)
