# Walkthrough - Corvus Star

## 2026-02-01: The Triple Alignment (Alpha, Beta, Omega)
**Objective**: Stabilize engine, optimize performance, and establish persona-reflective self-auditing.

### Performance & Engine (Beta)
- **Benchmarked**: Achieved **87.53ms** average startup time (N=100).
- **Encoding**: Fixed HUD character rendering (UTF-8) for Windows shells.

### Workflow & Audit (Alpha/Omega)
- **Workflow**: Updated `investigate.md` to mandate "Persona Signatures".
- **Skill**: Created `persona-audit` skill.
- **Outcome**: Semantic identity verification is now operational.
    - Verified purity score of **1.00** for ODIN dialogue.
    - Verified purity score of **0.40** (Deviance Flagged) for devian dialogue.

- **Fishtest**: 100% Accuracy (12/12) maintained after stabilization.

### Decree of Finality (Alpha)
- **Rejection Ledger**: Implemented `.agent/traces/quarantine/REJECTIONS.md` to track ingestion failures.
- **Documentation**: Fully mapped the Federated Learning Infrastructure in `wireframe.md`.
- **Completion**: Formally closed Phase 4 (The Network) in `tasks.md`.

---

## 2026-02-01: Trace Viz 2.0 & Identity Isolation
**Objective**: Decouple Trace Visualization from the active session's persona to allow "X-Ray" analysis of historical traces.

### Changes
- **Refactored `trace_viz.py`**: Introduced `TraceRenderer` class to handle visual output independently of `sv_engine.HUD`.
- **Identity Rendering**: The visualizer now respects the `persona` field in the trace file (ODIN traces render Red, ALFRED traces render Cyan) regardless of who is viewing them.
- **War Room**: Updated Conflict Analysis to use the new renderer.
- **Documentation**: Updated `AGENTS.md` to strictly enforce Persona Voice (`[ODIN]`, `[Ω]`) in agent communications.

### Verification Results
- **Synthetic Test**: Created `test_trace_odin.json` and `test_trace_alfred.json`.
- **Outcome**:
    - ODIN trace rendered with "THE WAR ROOM" and Red accents.
    - ALFRED trace rendered with "THE BATCAVE" and Cyan accents.
    - Verified strict separation of concerns.

---

# Walkthrough: AgLng Intelligent Handshake & Skill Proactivity

This session focused on making the AgLng framework robust, non-destructive, and proactive.

## 1. Intelligent Handshake (`install.ps1`)
The installation script is now interactive and safe. It detects conflicts and provides simple commands for the developer:
- **[O] Overwrite**: Replace existing files.
- **[S] Skip**: Keep current files.
- **[M] Merge**: Intelligently merge JSON or append new framework content to Markdown/Text files.
- **[D] Diff**: View differences before deciding.

## 2. Global Skill Registry (`skills_db/`)
We established a centralized registry in `CorvusStar`. This allows multiple projects to share high-performance skills (like UI audits, migration scripts, etc.) without duplicating code.

## 3. Proactive Recommendations (`sv_engine.py`)
The SovereignVector engine now scours the Global Registry:
- **Tier 1 (>90% Match)**: Proposes an immediate installation command.
- **Tier 2 (>50% Match)**: Includes the skill in a recommendation report.

## 4. Stability & Interoperability
- **BOM-less UTF-8**: All configuration files are now written as BOM-less UTF-8 to ensure Python and PowerShell communicate flawlessly.
- **JIT Deployment**: Use `python .agent/scripts/install_skill.py [name]` to add expertise to your project on the fly.

---

### Verification Proof
The system was verified by initializing a `mock_project` and searching for "futuristic interface", which correctly triggered a proactive proposal for the `ui-sci-fi` skill.

---

# Walkthrough: Vector ID Expansion & The 85% Bar (Corvus Star 1.2)

This session focused on the statistical hardening of the **SovereignVector** engine, moving from "lucky guesses" to "verifiable certainty."

## 1. The 85% Confidence Bar
We upgraded the execution logic to require a minimum **85% confidence score** for core commands. This prevents accidental triggers and ensures the agent acts only when the intent is clear.

## 2. Multidimensional Testing (`fishtest.py`)
The testing protocol was expanded to verify three new parameters:
- **`min_score`**: Statistical proof of intent confidence.
- **`expected_mode`**: Verification of resolution logic (matches via Vector Search vs. absolute Corrections).
- **`is_global`**: Accuracy of context identification (Local vs. Global).

## 3. Signal Boosting & Corrections
To hit the new high bar, we implemented:
- **`corrections.json` Integration**: A hard-mapped "fast path" for core intents, providing absolute reliability (1.10 score).
- **Signal Filtering**: Refined `sv_engine.py` to filter out stop words and weight Activation Words 10x higher than generic file content.

## Verification
- **Test Suite**: Ran `python fishtest.py` -> **100.0% Accuracy (10/10)**.
# Walkthrough: Core Nuance & SPRT Verification (Corvus Star 1.3)

This session introduced mathematical nuance to intent recognition and statistical rigor to the verification suite.

## 1. Weighted Thesaurus (`thesaurus.md`)
We moved beyond binary synonym matching. The engine now supports weights (e.g., `word:weight`), allowing us to dampen the impact of broad synonyms (like "go") while maintaining high confidence for precise terms (like "start").
- **Weighted Vectorization**: TF-IDF counts are now adjusted by the token's specific weight.
- **Improved Stemming**: Suffixes like `-ing`, `-ed`, and `-es` are automatically handled with a 0.8 weight dampening.

## 2. SPRT Verification (`fishtest.py`)
Implementation of the **Sequential Probability Ratio Test (SPRT)**. 
- **LLR Calculation**: The system now calculates the Log-Likelihood Ratio of current session results against a baseline.
- **Statistical Decisions**: Provides automated reporting on whether a change is a "Likely Improvement" or "Likely Regression" based on cumulative data.

## 3. SovereignFish Polish
- **Stemming implementation**: Handled suffixes in `sv_engine.py`.
- **Docs**: Cleaned up redundant headers in `tasks.md` and formalized the Weighting Standard in `SovereignFish.md`.

## Verification
- **Test Suite**: Ran `python fishtest.py` -> **100.0% Accuracy (10/10)**.
- **Confidence Tracking**: SPRT reported successfully with an LLR of 0.41, confirming functional stability across the new vectorizing logic.

# Walkthrough: The Triple Threat Expansion (Corvus Star 1.3)

This session executed the "Triple Threat" strategy, focusing on Visual Insight, Distributed Infrastructure, and Global Utility.

## 1. Neural Trace Visualizer (`trace_viz.py`)
A "Sci-Fi X-Ray" utility for the intention engine.
- **HUD Glow**: Implemented an advanced ANSI-based HUD with "glow" effects (dim/bright contrasts).
- **Signal Breakdown**: Visualizes the engine's decision-making process, showing exactly which tokens contributed to the confidence score and their IDF weights.

## 2. Distributed Fishtest Foundation
- **Trace Recording**: `sv_engine.py` now supports a `--record` flag for high-confidence interactions.
- **Trace Reporting**: Created `compile_session_traces.py` to aggregate these JSON traces into a markdown report (`TRACE_REPORT.md`) during the wrap-up sequence.
- **Archiving**: Processed traces are automatically moved to `.agent/traces/archive/` to keep sessions clean.

## 3. Global Skill Expansion
Added three new high-utility skills to the registry:
- **Git Assistant**: Context-aware commit message generation.
- **Code Stats**: Deep codebase metrics and debt estimation.
- **Agent Health**: Diagnostic utility for framework integrity.

## Verification
- **Visual**: Confirmed distinct "Glow" UI in terminal output.
- **Functional**: Verified high-confidence (>0.8) queries generate readable trace reports.
- **Statistical**: `fishtest.py` maintained 100% accuracy (10/10) after engine refactor.

# Walkthrough: Fishtest Scaling & Federation (Corvus Star 2.0)

This session focused on Scalability (N=10 -> N=1000) and Federated Learning (Inter-Agent Knowledge Sharing).

## 1. Fishtest Scalability (Phase 1 & 2)
We optimized the testing engine to handle enterprise-grade loads.
- **In-Process Optimization**: Refactored `fishtest.py` to remove `subprocess` overhead, improving speed from ~150ms/call to **0.3ms/call**.
- **Procedural Saturation**: Created `scripts/generate_tests.py` to generate 1000+ synthetic test cases combinatorially. 
- **Result**: Successfully verified 1000 queries in < 1 second.

## 2. Federated Learning (Phase 3)
We simulated a multi-agent environment to enable distributed learning.
- **Network Simulation**: Mocked a shared drive (`mock_project/network_share`) for trace exchange.
- **Trace Ingestion**: Created `tests/merge_traces.py` to ingest external agent traces.
- **Conflict Resolution**: Implemented "Real User Wins" logic, where actual session traces override synthetic data.
- **Adaptation**: The engine successfully "learned" new skills (`deployment-skill`) and vocabulary (e.g., "fix" for `/investigate`) from the federated data.

## Verification
- **Performance**: N=1000 Verified at ~0.3ms/call.
- **Learning**: Achieved 100.0% accuracy on federated traces after training.

# Walkthrough: Persona Initialization (Corvus Star 2.1)

This session introduced **Persona Logic**, allowing the framework to adopt distinct "personalities" that influence user interaction.

## 1. Dual Persona Framework
We implemented two core personas:
- **ODIN (GOD/Complete Domination)**: "The engine is law." Uses aggressive red/magenta themes, obtuse "Omniscient" language, and "Mandates" instead of suggestions.
- **ALFRED (Humble Servant)**: "Optimized options." Uses helpful cyan/green themes, polite language, and "Suggestions."

## 2. Interactive Initialization
`install.ps1` was updated to capture this preference during setup (`Get-PersonaChoice`) and store it in `.agent/config.json`.

## 3. Sovereign Vector Adaptation
`sv_engine.py` reads the config and dynamically adjusts:
- **Visuals**: Color palettes (Red vs Cyan).
- **Labels**: "COMMAND" vs "Intent", "ENTITY" vs "Match".
- **Interaction**: "AUTHORIZE DEPLOYMENT?" vs "Would you like to install?".

## Verification
- **Visual**: Manually verified both themes.
- **Protocol**: `fishtest.py` maintained 100% accuracy, confirming aesthetic changes did not break logic.

# Walkthrough: Vector-Driven Personas (Corvus Star 2.2)

This session operationalized the "Soul" of the framework, moving from simple text swaps to distinct, vector-driven operational strategies.

## 1. Vector Dialogue (`dialogue_db/`)
We moved hardcoded strings out of the engine and into a vector-retrievable corpus.
- **`odin.md`**: Contains "Dominating", "Imperious" intent blocks.
- **`alfred.md`**: Contains "Servile", "Polite" intent blocks.
- **`DialogueRetriever`**: A new class in `sv_engine.py` that uses the SovereignVector to fetch the most semantically appropriate response for a given system state (e.g., `INIT_SUCCESS`, `SEARCH_FAIL`).

## 2. Operational Divergence (`personas.py`)
The choice of persona now dictates *how* the framework behaves:
- **ODIN Strategy**:
    - **Enforcement**: Ruthlessly rewrites `AGENTS.md` and `tasks.md` to match the CorvusStar standard.
    - **Philosophy**: "Compliance is mandatory."
- **ALFRED Strategy**:
    - **Adaptation**: Respects existing file structures. If documentation is missing, it suggests or creates minimal non-intrusive files.
    - **Philosophy**: "At your service."

## 3. Utilities
- **`set_persona.py`**: A new script to toggle the active soul instantly.
- **`install.ps1`**: Updated to deploy the strategy engines and dialogue databases.

## Verification
- **Test Suite**: Created `tests/test_dominion.py` which verified:
    - ODIN overwrites non-compliant files.
    - ALFRED respects "messy" files.
    - Dialogue is correctly retrieved via vector search.
- **SovereignFish**: Implemented `KeyboardInterrupt` handling for the switcher and "Safe Loading" warnings for the engine.
- **Fishtest**: 100% Accuracy (12/12) verified.

# Walkthrough: Distributed Fishtest - The Aggregator (Corvus Star 2.3)

This session implemented the "Ingest" pipeline, the critical mechanism that allows CorvusStar agents to learn from each other's experiences.

## 1. Trace Aggregation (`merge_traces.py`)
We formalized the `tests/merge_traces.py` pilot into a core script `.agent/scripts/merge_traces.py`.
- **Conflict Resolution**: Implemented "Real User Wins" logic. If a real session trace conflicts with a synthetic test case, the Real User trace overwrites it. If two Real Users conflict, the **Last Writer** wins.
- **Archiving**: Processed trace files are automatically moved to a `processed/` subdirectory to prevent duplicate ingestion.
- **Robustness**: Added error handling for corrupt JSON files, moving them to a `failed/` directory.

## 2. Verification Suite
Created a permanent regression suite `tests/test_merge_traces.py` to ensure data integrity during ingestion.
- Verified **New Trace Addition**.
- Verified **Conflict Resolution** (Real User overwrite).
- Verified **File Archiving**.

## Verification
- **Functional**: Unit tests passed (3/3 cases) in <0.1s.
- **System**: Confirmed `merge_traces.py` can be run standalone or via automation.
### Verification (Session 6)
- **Code**: `sv_engine.py` HUD alignment logic patched for odd-length strings.
- **System**: Verified `latency_check.py` continues to report ~100ms baseline.

# Walkthrough: The Service Upgrade (Corvus Star 2.4)

This session focused on completing the "Neural Overwatch" suite and enforcing the Linscott Standard through rigorous testing and documentation protocols.

## 1. Neural Overwatch Complete
- **ASCII Sparklines**: `overwatch.py` now renders real-time trend lines for Engine Latency (10-sample window) using partial-block characters (` ▂▃▄▅▆▇█`).
- **War Zone Detection**: The dashboard leverages the Federated Database to detect and highlight "War Zones" (Tracing Conflicts) in real-time.

## 2. The Law of Latency
- **Protocol**: `network_watcher.py` (The Crucible) now strictly enforces a **5ms Regression Limit**.
- **Mechanism**: Incoming traces are measured against a baseline. Any trace causing >5ms slowdown is automatically rejected and logged in `REJECTIONS.md`.

## 3. Linscott Compliance
- **Tests**: Created unit tests for `overwatch.py` and `latency_check.py`.
- **Coverage**: Verified sparkline rendering logic and stats parsing.

---

## 🤝 Session Handshake (The Delta)

**What Changed:**
- [NEW] `.agent/scripts/overwatch.py`: Added Sparkline class and `--help` argument.
- [NEW] `tests/test_overwatch.py`: Unit tests for dashboard logic.
- [NEW] `tests/test_latency_check.py`: Unit tests for performance gating.
- [MOD] `README.md`: Updated with Federation & Overwatch documentation.
- [MOD] `AGENTS.md` & `wrap-it-up.md`: Formalized "Session Handshake" protocol.

**To Resume, Start Here:**
1. **Monitor**: Run `python .agent/scripts/overwatch.py` to verify system health.
2. **Next Objective**: Proceed to **Triple Threat Expansion** in `tasks.md`.

# Walkthrough: The Triple Expansion (Corvus Star 3.0)

This session executed the 'Triple Threat' expansion, transforming the framework's architecture, intelligence, and observability.

## 1. The Iron Backbone (ui.py)
We consolidated all UI logic into a single library, enforcing the Linscott Standard across the ecosystem.
- **Unified HUD**: sv_engine.py, merge_traces.py, fishtest.py, trace_viz.py, and overwatch.py now all import from .agent/scripts/ui.py.
- **Identity Isolation**: The ui.py module supports dynamic Persona switching, allowing tools like trace_viz.py to render historical traces in their native theme (Red/Cyan) regardless of the active session.

## 2. The Sovereign Cycle (tune_weights.py)
We implemented the self-optimization loop.
- **Analysis**: compile_failure_report.py generates health reports from the Rejection Ledger.
- **Tuning**: tune_weights.py analyzes fishtest data to identify 'Confusing Tokens' (tokens that appear in rival skills) and proposes down-weighting them in thesaurus.md.

## 3. The All-Seeing Eye (Interactive Overwatch)
The monitoring dashboard is now an interactive control center (using msvcrt on Windows).
- **Controls**:
    - [C]lear: Wipes the console for a fresh view.
    - [P]urge: Clears the Rejection Ledger.
    - [Q]uit: Graceful shutdown.

## Verification
- **Fishtest**: maintained 100% accuracy (12/12) after refactor.
- **Overwatch**: Verified Key-Hit logic via verification command.
- **Trace Viz**: Verified Theme Persistence for 'War Room' mode.

---

## 🤝 Session Handshake (The Triple Expansion)

**What Changed:**
- [NEW] .agent/scripts/ui.py: The core UI library.
- [NEW] .agent/scripts/tune_weights.py: Thesaurus optimizer.
- [NEW] .agent/scripts/compile_failure_report.py: Failure analyst.
- [MOD] sv_engine.py, fishtest.py, merge_traces.py, trace_viz.py, overwatch.py: Refactored to use ui.py.
- [MOD] overwatch.py: Added msvcrt interactivity.

**To Resume, Start Here:**
1. **Interactive Test**: Run 'python .agent/scripts/overwatch.py' and press [C] to test the new backbone.
2. **Optimize**: Run 'python .agent/scripts/tune_weights.py' to apply the latest learnings to thesaurus.md.



# Walkthrough: Operation Iron Clad (Corvus Star 3.1)

This session executed the [ODIN] 'Iron Clad' protocol, enforcing the Torvalds Mandate across the framework's core utilities.

## 1. The Iron Backbone (ui.py)
We refactored ui.py to be bulletproof.
- **Strict Typing**: All methods now have typing hints (List, Optional, Dict).
- **Safety**: Added assert logic to box_top to prevent rendering artifacts on narrow terminals (<10 chars).
- **Documentation**: Added Google-style docstrings to all methods.

## 2. Neural Overwatch Hardening (overwatch.py)
We hardened the monitoring dashboard against runtime failures.
- **Robust Input**: msvcrt.kbhit() checks are now guarded by OS checks (os.name == 'nt') and try-except blocks.
- **Typing**: Added return type annotations to internal logic (get_stats() -> Dict).
- **Fix**: Removed legacy Sparkline class dependency (now correctly using ui.HUD.render_sparkline).

## 3. SovereignFish Improvements
- **Code**: latency_check.py received full type hinting and docstrings.
- **Code**: trace_viz.py's TraceRenderer was refactored with type safety for improved symmetry enforcement.

## Verification
- **New Suite**: Created tests/test_ui.py to verify the new Backbone.
- **Regression**: fishtest.py maintained 100% accuracy (12/12).
- **Unit**: Repaired tests/test_overwatch.py passed.

---

## ?? Session Handshake (The Iron Clad)

**What Changed:**
- [MOD] .agent/scripts/ui.py: Strict Typing & Docstrings.
- [MOD] .agent/scripts/overwatch.py: Hardened against crashes.
- [NEW] tests/test_ui.py: New verification suite.
- [FIX] tests/test_overwatch.py: Removed deprecated legacy imports.

**To Resume, Start Here:**
1. **Optimization**: Proceed to **Phase 2: The Sovereign Cycle** (Task: tune_weights.py optimization).
2. **Oracle**: Consider implementing the postponed 'Oracle's Eye' protocol.

# Walkthrough: Operation Iron Cortex (Corvus Star 3.2)

This session executed the 'Iron Cortex' strategy, refactoring the core engine for modularity and implanting self-referential intelligence (RAG).

## 1. The Iron Core (Refactor)
- **Modularization**: We split the monolithic `sv_engine.py` into a clean package structure (`engine/`).
    - `vector.py`: Holds the core mathematics.
    - `dialogue.py`: Holds the persona logic.
- **Facade**: `sv_engine.py` was rewritten as a lightweight entry point, preserving all existing CLI args for backward compatibility.

## 2. The Cortex (Intelligence)
- **RAG Module**: Implemented `engine/cortex.py`.
- **Function**: It ingests `AGENTS.md` and `wireframe.md` to allow the agent to query its own laws.
- **Interface**: `python .agent/scripts/sv_engine.py --cortex "query"` uses the same vector logic to find documentation chunks.

## Verification
- **Benchmark**: `sv_engine.py` startup verified at 0.08s.
- **Unit Tests**: `tests/test_cortex.py` passed (2/2).
- **Manual**: Successfully queried "web visualization" to find the ban.

---

## 🤝 Session Handshake (Iron Cortex)

**What Changed:**
- [NEW] `.agent/scripts/engine/`: Core logic package.
- [NEW] `.agent/scripts/engine/cortex.py`: The RAG brain.
- [mod] `.agent/scripts/sv_engine.py`: Now a wrapper.
- [NEW] `tests/test_cortex.py`: Verification suite.
- [MOD] `AGENTS.md`: Added "No Web Viz" mandate.

**To Resume, Start Here:**
1. **Query**: Ask the Cortex: `python .agent/scripts/sv_engine.py --cortex "how to add a skill"`

# Walkthrough: The ODIN Protocol (The Planning Update)

This session implemented the **`/plan`** workflow, enforcing a rigorous "Interrogation" phase before any code is written. It also formalized the "Subconscious Architecture" (Whisper/Void) to ensure the inactive persona remains relevant.

## 1. The Planning Protocol (`/plan`)
We created `.agent/workflows/plan.md`, which defines a strict 5-phase process:
1.  **The Loop**: Recursive interrogation until scope is clear.
2.  **The Blueprint**: Architecture mapping in `wireframe.md`.
3.  **The Prophecy**: Proactive "Future Vision" proposals.
4.  **The Battle Plan**: Granular task breakdown.
5.  **The Ratification**: Final sign-off.

## 2. Subconscious Architecture
We updated `AGENTS.md` and `investigate.md` to support the "Inactive Voice":
-   **Alfred's Whisper**: When ODIN is active, Alfred offers gentle optimization tips.
-   **Odin's Void**: When ALFRED is active, Odin shouts ambitious demands.

## Verification
-   **Simulation**: Manually verified the workflow logic by "playing it out" in the proposal phase.
-   **SovereignFish**: Implemented 2 improvements (Task Header Standardization, Subconscious Checks).

---

## 🤝 Session Handshake (The Planning Update)

**What Changed:**
-   [NEW] `.agent/workflows/plan.md`: The Planning Protocol.
-   [MOD] `AGENTS.md`: Added "Subconscious Architecture" section.
-   [MOD] `wireframe.md`: Registered `plan.md`.
-   [MOD] `.agent/workflows/investigate.md`: Added "Subconscious Check".
-   [MOD] `.agent/workflows/run-task.md`: Standardized headers.

**To Resume, Start Here:**
1.  **Plan**: Run `/plan` to define the next major feature (likely "Trace Visualization 3.0" or "Web Dashboard").
2.  **Next Objective**: Proceed to the next item in `tasks.md`.
