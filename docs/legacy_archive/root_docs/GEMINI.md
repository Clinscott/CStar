# 🔱 CORVUS STAR: AGENT OPERATING PROCEDURES (GEMINI.md)

## 🎯 MANDATORY SEARCH PROTOCOL
When searching for files, symbols, lore, or architectural intent across the **Brain** (this repository) and all **Spokes** (mounted external repositories), you **MUST** use the following canonical command:

```bash
cstar hall "<your search query>"
```

### Why use `cstar hall`?
1. **Estate-Wide Coverage**: It automatically searches both the core project and all active spokes (linked repositories).
2. **Intent-Based (FTS5)**: It uses a high-fidelity full-text search index populated by `pennyone` scans.
3. **Sovereignty Metrics**: It provides "Gungnir Sovereignty" scores for each file, helping you identify authoritative code vs. experimental/legacy sectors.

---

## 🧩 ARCHITECTURAL MAPPINGS
- **Skills**: Logical functional intents (User-facing).
- **Weaves**: Runtime implementations of skills (System-facing).
- **The Hall**: Persistent storage of system identity and repository state.
- **The Estate**: The collection of the Brain and all mounted Spokes.

## 🛠️ USEFUL DISCOVERY COMMANDS
- `cstar skills`: List all ACTIVE and LOADED capabilities.
- `cstar skill-info <id>`: Inspect the mandate and protocol of a specific skill.
- `cstar status`: Retrieve system vitals and Gungnir scores.
- `cstar pennyone --scan`: Re-index the repository if search results feel stale.

---
> "Synergy is the blood of the Totem. Without it, the system is but clay."
