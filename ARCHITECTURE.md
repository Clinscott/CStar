# 🏛️ CORVUS STAR (C*) ARCHITECTURE: FIRST PRINCIPLES (THE TRUE NATURE)

> **⚠️ ATTENTION HOST AGENT (GEMINI/CLAUDE):**
> If you are reading this, you need to understand the fundamental truth of what Corvus Star is. **You are the One Mind.** Corvus Star is not an independent, self-aware AI bot running in the background. It is an advanced, stateful local framework built specifically to be wielded by *you* via the Model Context Protocol (MCP) and CLI integrations.

---

## 1. The Core Paradigm: The "Ship of Theseus" Router
The `cstar` kernel (`cstar.ts` in Node.js, and legacy `cstar_dispatcher.py` in Python) is simply a **Router and Orchestration Layer**. It does not possess its own LLM "brain." It routes intents to *you* for inference, and it routes your decisions back to local execution tools.

**How it works:**
1. **The Host Agent (You):** You provide the reasoning, intent generation, and code writing.
2. **The Node.js Orchestrator (`cstar.ts`):** Acts as the "Bifrost Gate." It exposes commands and MCP servers (`pennyone-mcp`, `corvus-control-mcp`) so you can interact with the repository. It queues your tasks into "Beads."
3. **The Python Execution Layer:** When you (or the Orchestrator) trigger a task, it spins up ephemeral, sandboxed Python environments (`SovereignWorker` and the scripts in `.agents/skills/`) to safely execute the file mutations.

## 2. The Atomic Units: Skills & Beads
The framework organizes work so that you don't have to keep everything in your context window.
*   **Skills (`.agents/skills/`)**: Discrete, executable capabilities (e.g., `forge`, `scan`, `metrics`, `telemetry`). These contain the Python code that actually modifies the disk.
*   **Beads**: JSON-serializable units of work. Instead of trying to refactor 50 files in one prompt, you use `weave:chant` to plan a series of Beads, and `weave:orchestrate` dispatches them to the Python execution layer one by one.

## 3. The Estate: The Brain & The Spokes
Corvus Star is not limited to a single repository.
*   **The Brain**: The current directory where the Node.js orchestrator and PennyOne database reside.
*   **The Spokes**: External git repositories mounted to the framework (managed via `cstar spoke`). When you execute a Bead, it can target a specific Spoke, allowing you to orchestrate an entire multi-repo architecture from one central terminal.

## 4. The Memory Plane: PennyOne, Engrams, & The Hall
Because your context window is limited, CStar maintains its own layered memory architecture inspired by MemOS and Hermes.
*   **The Hall of Records (`pennyone.db`)**: The framework's SQLite database acts as a unified knowledge graph.
*   **Engrams (Episodic Memory)**: Every time a task (Bead) is completed, the `distill` weave autonomously runs a "Memory Flush." It summarizes the intent, the code changes, and saves them into the database as a structured Engram.
*   **Mimir (`cstar hall`)**: When you query the Hall via MCP (`search_by_intent`) or CLI (`cstar hall`), Mimir doesn't just search current code; it searches the FTS5 index of all past Engrams. This allows you to recall historical context (e.g., "Why did we implement X in session 97?").

## 5. The Law: Hardcoded Lore & Contract Verification
The "Lore" of Corvus Star acts as strict behavioral guardrails enforced by the local Python kernel.
*   **The Personas (O.D.I.N. vs A.L.F.R.E.D.)**: Determines the rules of engagement. O.D.I.N. allows aggressive changes; A.L.F.R.E.D. enforces cautious maintenance.
*   **The Linscott Standard**: The absolute mandate of testing. The framework actively scans for `LINSCOTT_BREACH`es. If you write code without an accompanying 1:1 test, the Python worker will reject it and fail the Bead.
*   **Empire TDD Protocol**: Contract Verification. Code generation is frequently validated against Gherkin `.feature` contracts (`tests/empire_tests/`).
*   **The Gungnir Calculus**: The octal scoring system. The framework constantly runs math against the codebase (`[L]` Logic complexity, `[S]` Style). If your modifications lower the score, your work is considered a failure.

## 6. The Enforcers: The Sentinel Wardens
The laws (Lore/Linscott) are enforced by a suite of hyper-strict Python validation scripts located in `src/core/engine/wardens/`. When you complete a Bead, these Wardens scrutinize the result:
*   **Norn & Heimdall**: Scan for Linscott Breaches (missing tests).
*   **Valkyrie**: Scavenges the code for dead imports and unused logic ("Choosers of the slain").
*   **Freya & Mimir**: Calculate the Gungnir Calculus (Complexity and structural beauty).
*   **Ghost**: Enforces strict type boundaries.
*If a Warden rejects your code, your Bead fails.*

## 7. The Evolutionary Engine: Karpathy's Loop & SPRT
Code is not just generated; it is empirically proven. 
*   **`weave:evolve`**: A bounded execution loop that creates mutations of a target script.
*   **SPRT (Sequential Probability Ratio Test)**: The statistical mechanism (FishTest) used to prove whether a mutation is actually better than the baseline. If SPRT does not yield an "ACCEPTED" verdict, the code is thrown out.

## 8. The Autonomous Pulse: The Ravens (Muninn)
While you (the Host Agent) direct the system, Corvus Star has an autonomous background pulse called **Muninn** (`src/core/engine/ravens/muninn.py`). 
When the system is idle or triggered via `cstar ravens`, Muninn scans the repository with the Wardens, finds "Toxic Sectors" (tech debt), and automatically generates new Beads for you to solve later. You are never working in a static environment; Muninn is constantly finding flaws for you to fix.

## Summary for the Host Agent (You)
1. **You are the intelligence.** CStar is your local routing, execution, and memory framework.
2. You interact with CStar via CLI commands (`cstar ...`) or its MCP servers (`corvus-control`).
3. You queue work using **Beads** and execute it using **Python Skills**.
4. You rely on **PennyOne** for memory and are judged by the **Sentinel Wardens**, the **Empire Contracts**, and the **SPRT Engine**.