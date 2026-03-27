# 🔱 SOVEREIGN SKILL, WEAVE, & SPELL PERMUTATIONS

> **ROLE:** The Loom of the One Mind  
> **PURPOSE:** Systematically map the synergy between atomic primes, intentional weaves, and recursive spells within the Universal Skill Registry.

---

## 💎 THE HIERARCHY OF POWER
The framework operates on a four-tier classification system, defined in `skill_registry.json`. This document is descriptive; registry metadata and runtime contracts remain authoritative.

### 1. The Primes (Atomic Layer)
The fundamental building blocks of all logic. They execute single operations and return data.
*   **Observation**: `hall`, `mimir`, `metrics`, `scan`, `vitals`.
*   **Reasoning**: `oracle`, `calculus`, `trace`, `style`.
*   **Mutation**: `agentic-ingest`, `forge`, `memory`, `report`.
*   **Isolation**: `jailing`, `gatekeeper`, `locks`.

### 2. The Skills (Discrete Capabilities)
Self-contained units of work that combine Primes or external tools to achieve specific functional goals. 
*   **Examples**: `empire`, `edda`, `matrix`, `taste-skill`, `autobot`, `mcp`.

### 3. The Weaves (Intentional Chains)
A linear sequence of Primes and Skills orchestrated to achieve a complex technical outcome. Weaves are stateful and managed by the Node.js `RuntimeDispatcher`.
*   **The Creation Loop**: build new features (`chant` -> `forge` -> `evolve`).
*   **Contract Hardening**: enforce Sterling compliance (`gherkin` -> `empire` -> `trace`).
*   **Restoration**: autonomous repair (`hall` -> `evolve` -> `trace` -> `distill`).
*   **Expansion**: onboard a spoke (`spoke` -> `scan` -> `agentic-ingest` -> `matrix`).

### 4. The Spells (Recursive Sovereignty)
Spells are governance wrappers over desired-state policies. Unless the registry marks a spell as `runtime-backed`, do not treat it as a peer execution surface to weaves.
*   **Logic**: `Policy` + `Feedback Gate` + `Recursion`.

---

## 📊 THE SPELL MATRIX (TIER 4)

| Spell Name | Classification | Weave Foundation | Feedback Gate (The Trigger) | Emergent State |
| :--- | :--- | :--- | :--- |
| **The Silver Shield** | `policy-only` | `vigilance` + `restoration` | IF `Style [S] < 6.0` OR `Drift` THEN Execute | **Immutability** |
| **The Living Well** | `policy-only` | `expansion` + `agentic-ingest` | IF `Git Hook: Post-Commit` THEN Execute | **Omniscience** |
| **The Phoenix Loop** | `policy-only` | `restoration` + `evolve` | IF `Verification == FAILURE` THEN Recast | **Self-Healing** |
| **The Shattering Strike**| `policy-only` | `forge` + `restoration` | IF `Logic [L] < 4.0` THEN Decompose | **Fractal Purity** |

---

## 🧩 THE EXECUTION MODES
The Universal Skill Registry dictates how agents interact with these tiers:

1. **Agent-Native**: The agent reads the `SKILL.md` (Markdown) and executes the instructions manually using built-in agent capabilities. No TypeScript dispatcher is needed. Used for Primes, standard Skills, and policy-layer spells.
2. **Kernel-Backed**: The agent reads the `.md` definition, but physical execution is routed through the TypeScript `RuntimeDispatcher` using a strict payload. Used for complex Weaves (`weave:restoration`, `weave:expansion`, `weave:vigilance`) requiring state management and telemetry.

## Spell Classification Boundary

Spells must be classified in the registry as one of:

1. `runtime-backed`: directly executable through a tested runtime path.
2. `policy-only`: governance guidance that may trigger weaves or agent behavior but is not itself a direct runtime command.
3. `deprecated`: retained for historical continuity and migration only.

---
> "Linear logic solves problems once. Recursive logic eliminates them forever."
