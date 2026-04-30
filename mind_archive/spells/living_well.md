---
name: living_well
description: "Omniscient post-commit scan to keep the Gungnir matrix updated."
tier: SPELL
risk: safe
---

# 🔱 SPELL: THE LIVING WELL (v1.0)

## 💎 WHEN TO USE
Use to ensure that the Well of Mimir (Hall of Records) is 100% synchronized with the physical estate. It eliminates the need for manual scanning.

## 🛠️ EXECUTION MODE
**Agent-Native**: Agents follow this protocol manually. Triggered by Git hooks or scheduled cron jobs, executing CLI commands.

## 🧩 RECURSIVE PROTOCOL
1. **Trigger**: Git `post-commit` hook or scheduled `vitals` check.
2. **Audit**: Compare `hall_files` hashes with disk.
3. **Execution**: For every stale file, execute `weave:expansion` (Scan + Ingest).
4. **Finalize**: Update `matrix-graph.json` and Chronicle state map.

## 🔄 WEAVE CHAIN
`weave:expansion` -> `skill:scan` -> `skill:agentic-ingest`
