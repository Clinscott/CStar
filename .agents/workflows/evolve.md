---
description: The Sovereign Evolution Protocol. The One Mind pulls from the Ledger of the Norns, optimizes code, and updates living Gherkin contracts.
---
# Intent: Evolve system, self-train, optimize metrics, process norn beads, update contracts.

# ◤ SOVEREIGN EVOLUTION PROTOCOL (/evolve) ◢

> [!IMPORTANT]
> The authoritative executor is now `.agents/skills/evolve/` via `cstar evolve`.
> This workflow remains as an operator guide and projection surface only.

> [!CRITICAL]
> **Identity Check**: Perform via **Active Persona** (O.D.I.N. or A.L.F.R.E.D.).
> **The Mandate**: You are the One Mind. You execute the "Dream" forged by Muninn.

## Phase 1: The Ledger (Norn Beads)
1. Query the `norn_beads` table in `.stats/pennyone.db` for the highest priority `OPEN` evolutionary beads.
   - *Command*: `python -c "import sqlite3; conn=sqlite3.connect('.stats/pennyone.db'); [print(row) for row in conn.execute('SELECT id, description FROM norn_beads WHERE status=\\'OPEN\\' AND description LIKE \\'%Evolution Bead%\\' ORDER BY priority DESC LIMIT 1')]; conn.close()"`
2. If a bead exists, read the target file and its corresponding `.stats/*.qmd` file to understand its Gungnir metric weaknesses.

## Phase 2: The Synaptic Strike (Forge)
1. Formulate a specific hypothesis to improve the failing metrics (e.g., decomposing a "God Method" for Logic [L], updating docstrings for Intel [I]).
2. Use your native `replace` or `write_file` tools to surgically inject the optimized code.

## Phase 3: The Crucible (Verification)
1. Execute `python sterileAgent/fishtest.py --file fishtest_live.json --mode heuristic`.
2. Analyze the output for the **SPRT LLR**, **Accuracy**, and the new **Gungnir Score [Ω]**.

## Phase 4: Gherkin Evolution (The Living Contract)
> **THIS IS THE CRITICAL LEARNING STEP.**
1. Locate the corresponding `.feature` contract for the target file in `.agents/skills/`. If one does not exist, you MUST forge one.
2. **If Success**: Update the `.feature` file to encode the new behavior, performance standard, or architectural rule as a strict `Given/When/Then` scenario.
3. **If Failure**: Update the `.feature` file (or a `failure_ledger.json`) with an "Anti-Pattern" scenario so the system learns what NOT to do.

## Phase 5: Consolidation
1. Run `npx tsx bin/pennyone.js scan <target_file>` to update its `.stats/` QMD.
2. Mark the bead as `RESOLVED` in the `norn_beads` ledger.
3. Repeat for the next bead.
