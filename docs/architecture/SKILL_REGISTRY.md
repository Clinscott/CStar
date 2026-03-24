# 🔱 THE UNIVERSAL SKILL REGISTRY

> **ROLE**: The Authority Manifest  
> **LOCATION**: `.agents/skill_registry.json`

The Universal Skill Registry is the single source of truth for all capabilities within the Corvus Star estate. It provides a unified, agent-agnostic map of Primes, Skills, Weaves, and Spells, accessible to Claude Code, Gemini CLI, Codex CLI, and Antigravity.

---

## 💎 REGISTRY SCHEMA (v2.0)

The registry (`skill_registry.json`) uses a strict schema defining the tier, viability, risk, and execution mode of every capability.

### 1. The Four Tiers
Everything in the framework belongs to one of four tiers:
*   **PRIME**: Atomic operations mapped to the four core directives (`observation`, `reasoning`, `mutation`, `isolation`).
*   **SKILL**: Discrete, functional capabilities (`empire`, `matrix`, `taste-skill`).
*   **WEAVE**: Linear sequences of skills orchestrated for a complex outcome (`restoration`, `vigilance`, `expansion`).
*   **SPELL**: Recursive feedback loops that maintain sovereign states (`phoenix_loop`, `silver_shield`).

### 2. Execution Modes
Agents discover capabilities by reading `.md` files, but *execution* happens in two ways:
*   **Agent-Native**: The AI agent follows the Markdown instructions manually using its own CLI tools and file editors. No backend code is required.
*   **Kernel-Backed**: The AI agent sends a structured JSON payload to the Node.js `RuntimeDispatcher`. The TypeScript CStar Kernel handles the actual execution, state management, and error recovery.

### 3. Viability & Risk
*   **Viability**: `ACTIVE` (ready for use), `PLANNED` (stubbed out), or `DEPRECATED` (do not use). Non-viable legacy skills have been moved to `.agents/skills/_archive/`.
*   **Risk**: `safe` (standard operations), `high-authority` (requires user consent, e.g., git hooks), or `safety-critical` (kernel-level changes).

---

## 📊 CURRENT ESTATE INVENTORY (Active Tiers)

### The Primes (19)
`hall`, `mimir`, `metrics`, `scan`, `vitals`, `status`, `manifest`, `qmd_search`, `oracle`, `calculus`, `trace`, `style`, `agentic-ingest`, `forge`, `scribe`, `report`, `jailing`, `gatekeeper`, `locks`.

### The Skills (28)
`annex`, `autobot`, `bifrost`, `bookmark-weaver`, `cachebro`, `chronicle`, `consciousness`, `corvus-control`, `distill`, `edda`, `empire`, `engine`, `gherkin`, `hunt`, `linter`, `matrix`, `norn`, `one-mind`, `personas`, `promotion`, `redactor`, `research`, `ritual`, `spoke`, `sprt`, `stability`, `sterling`, `taliesin`, `taste-skill`, `telemetry`, `visual-explainer`, `warden`.

### The Weaves (8)
`chant`, `evolve`, `orchestrate`, `ravens`, `start`, `restoration`, `expansion`, `vigilance`, `creation_loop`, `contract_hardening`, `living_architecture`, `secure_speculation`, `ephemeral_grid`.

### The Spells (4)
`living_well`, `phoenix_loop`, `shattering_strike`, `silver_shield`.
