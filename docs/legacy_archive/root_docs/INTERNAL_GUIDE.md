# 🔱 CORVUS STAR: INTERNAL NAVIGATION GUIDE

This guide maps out the authoritative sectors of the CStar framework to ensure efficient agent traversal and symbolic discovery.

## 📂 CORE DIRECTORY MAPPING

| Sector | Purpose | Sovereignty |
| :--- | :--- | :--- |
| `src/node/core/runtime/` | TypeScript Runtime Engine (Weaves, Dispatcher, Kernel) | HIGH |
| `src/core/engine/` | Python Core Engine (SovereignWorker, BeadLedger) | HIGH |
| `src/tools/pennyone/` | The Hall of Records (Intel, Database, Symbolic Scanners) | HIGH |
| `.agents/skills/` | Distributed Agent Skills (autobot, research, chant) | HIGH |
| `.stats/` | Persistent metrics, episodic memory, and worker artifacts | MED |
| `tests/` | Unit and integration tests (Mandatory for resolution) | HIGH |

## 🧩 ARCHITECTURAL SYMBOLS

### 1. Weaves (`src/node/core/runtime/weaves/`)
Weaves are the implementation of internal intents.
- `chant.ts`: Orchestrates the Research -> Strategy -> Bead workflow.
- `orchestrate.ts`: Dispatches SET beads to workers.
- `autobot.ts`: Bridges the orchestrator to the Python worker logic.
- `host_worker.ts`: Escalation point for Host Agent fulfillment.

### 2. Workers (`src/core/engine/`)
- `sovereign_worker.py`: The native CStar worker using XML protocol for local LLM.
- `bead_ledger.py`: The source of truth for all bead states.

## 🛠️ CANONICAL COMMANDS

- **Search the Hall:** `./cstar hall "<query>"`
- **Start Planning:** `./cstar chant "<user intent>"`
- **Execute Beads:** `./cstar orchestrate -p 1` (Use `--timeout 1800` for deep reasoning)
- **Check Status:** `./cstar status`
- **Scan Repo:** `./cstar pennyone --scan`

## 🧠 NAVIGATION TIPS
- **Symbol Discovery:** If you cannot find a class or function, grep `src/node/core/runtime/contracts.ts` first; it defines the core interfaces.
- **Worker Debugging:** Check `.stats/autobot/` for real-time transcripts and JSON metadata from the Sovereign Worker.
- **Database Inspection:** `CStar/.stats/pennyone.db` contains all beads, lore, and episodic memory.

---
> "Mapping the Void is the first step to conquering it."
