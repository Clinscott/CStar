# Agent Memory

## 🧠 Application Context
- **Name**: Corvus Star (C*)
- **Purpose**: A self-evolving, agentic framework for standardized project initialization and skill management.
- **Core Philosophy**: "The Linscott Standard" (Verify, Test, Optimize).
- **Persona System**: Dual-mode (ODIN = Domination/Strict, ALFRED = Service/Polite).

## 🏗️ Architectural Decisions

### 1. SovereignVector Engine (`sv_engine.py`)
-   **No LLM Dependency**: Uses local TF-IDF (Text Frequency-Inverse Document Frequency) for intent recognition. Fast, offline, privacy-focused.
-   **Correction Layer**: Mapped corrections in `corrections.json` override vectors (Score 1.1). Used for critical/destructive commands.
-   **Proactive Registry**: Can scan a global `skills_db` folder and propose JIT installation if confidence > 0.85.

### 2. Fishtest Verification (`fishtest.py`)
-   **SPRT**: Uses Sequential Probability Ratio Test to statistically validate engine changes (H0 vs H1).
-   **Distributed Learning**: Can ingest traces from other agents to learn new synonyms.
    -   **Real User Wins**: User traces always override synthetic test data.
    -   **Rejection Audit**: Purged traces are logged in `REJECTIONS.md` with persona-stamped reasoning.

### 3. Persona Architecture (The "Soul" System)
-   **Vector Dialogue**: Response text is fetched via `DialogueRetriever` from `dialogue_db/` markdown files, treating conversation as a vector search problem.
-   **Strategy Pattern**: `personas.py` injects operational strategies (Strict vs Adaptive) at runtime.
-   **Identity Rendering**: `trace_viz.py` enforces visual consistency (Odin=Red, Alfred=Cyan) by reading the `persona` tag from historical traces.

### 4. The Triple Threat (Visuals, Distribution, Global Skills)
-   **Visuals**: `trace_viz.py` provides a glowing Sci-Fi HUD for debugging.
-   **Stats**: `codestats` skill provides deep codebase metrics.
-   **Health**: `agent-health` skill diagnoses workflow issues.

## 📝 Learned Patterns
-   **PowerShell Encoding**: ALWAYS use `utf-8` (no BOM) for JSON files shared between Python and PowerShell.
-   **Trace Recording**: Only record traces when explicitly asked (`--record`) to avoid disk bloat.
-   **JSON is Truth**: For cross-component communication (Trace -> Viz), JSON is the only reliable courier.

## 🛑 Critical Rules
-   **Do NOT Overwrite**: When editing `tasks.md`, mark as complete but keep history.
-   **Always Test**: Run `fishtest.py` before committing engine changes.
-   **SovereignFish**: Run the SovereignFish protocol EVERY session to polish the codebase.
-   **Torvalds Mandate**: Strictly enforced. No PoCs, no bare-bones. Every feature must be production-hardened and structurally sound from the first commit. Efficiency follows Excellence.
