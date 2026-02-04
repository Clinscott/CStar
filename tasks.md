# Task: Corvus Star Framework Development

- [x] Initialize project structure [x]
- [x] Populate agent workflows [.agent/workflows] [x]
- [x] Synchronize Linscott Standard in AGENTS.md [x]
- [x] Create `init.md` in `sterileAgent` with God Command [x]
- [x] Standardize sterile templates [x]

### Core Components
- `sterileAgent`: Generic template repository for new project initialization.
- `skills_db`: Global Skill Registry for proactive framework recommendations.
- `skills`: (Optional) Project-specific custom skills.
    - `search(query)`: Maps natural language to local and global (proactive) skill triggers.
    - `expand_query()`: Handles synonyms and stemming via `thesaurus.md`.
    - `propose_immediate_install`: Generates JIT installation commands for high-confidence global matches.

### Skill Management
- **Path**: `.agent/scripts/install_skill.py`
- **Description**: Utility to deploy skills from the Global Registry to the local project.

- [x] Pilot Deployment & Handshake Verification [x]
- [x] Intelligent Installation & Logical Merging [x]
- [x] Global Skill Registry & Proactive Recommendations [x]
    - [x] Achieved 100% Fishtest Accuracy (N=8) [x]

### 4. Interactive Reactivity (Proposal A)
- [x] **sv_engine.py**: Implement interactive `input()` for JIT skill installation. [x]
- [x] **sv_engine.py**: Verify HUD feedback during installation. [x]

### 5. Agent Lightning PoC (Proposal B)
- [x] **lightning_rod.py**: Create PoC script for file read/write optimization loop. [x]
- [x] **lightning_rod.py**: Integrate HUD for status reporting. [x]

### 6. Sterile Agent Sync (Proposal C)
- [x] **Sync**: Propagate `sv_engine.py` to `sterileAgent`. [x]
- [x] **Sync**: Propagate `install.ps1` to `sterileAgent`. [x]
- [x] **Verify**: Ensure template is up-to-date. [x]

### 7. Core Nuance (Current Phase)
- [x] **Thesaurus**: Implement weighted synonyms in `sv_engine.py` [x]
- [x] **Engine**: Update vectorizer to handle token weights [x]
- [x] **SPRT**: Formalize Sequential Probability Ratio Test in `fishtest.py` [x]
- [x] **Stemming**: Improve query expansion with suffix handling [x]

### 8. The Triple Threat Expansion (Next Phase)
- [x] **Trace Visualizer**: Create `.agent/scripts/trace_viz.py` (Sci-Fi HUD "X-Ray"). [x]
- [x] **Global Skills**: [x]
    - [x] `git-assistant`: Context-aware commit logic. [x]
    - [x] `codestats`: Deep codebase metrics. [x]
    - [x] `agent-health`: Workflow diagnostics. [x]
- [x] **Distributed Fishtest**:- [x] **Verification**:
    - [x] Update `tests/test_ui.py` (or create if missing).
    - [x] Update `tests/test_overwatch.py`.
    - [x] Verify `fishtest` pass.
- [x] **SovereignFish**:
    - [x] Harden `latency_check.py` (Code Hardening).
    - [x] Harden `trace_viz.py` (Code Hardening).
(Pending Trace accumulation). [x]
    - [x] **Phase 4 Complete**: Automated trace ingestion and conflict resolution verified. [x]

### 9. SovereignFish Mandate (Session Standards)
- [x] **Refactor**: Externalize stopwords to `stopwords.json`. [x]
- [x] **Aesthetic**: Implement "Glow" effect in `HUD` class. [x]

### 10. Persona Logic & Interaction
- [x] **Initialization**: Add Persona (God/Alfred) selection to `install.ps1`. [x]
- [x] **Engine**: Implement Persona-aware HUD themes and prompts in `sv_engine.py`. [x]
- [x] **Dialogue Expansion**: Create distinct, expanded dialogue sets for 'God' (Obtuse/Dramatic) and 'Alfred' (Humble/Helpful). [x]
    - [x] **Architecture**: Implemented Vector-Driven `DialogueRetriever` in `sv_engine.py`. [x]
    - [x] **Content**: Created `dialogue_db/odin.md` and `dialogue_db/alfred.md`. [x]
    - [x] **Skill Proposal**: Create `workflow-analyst` skill to scan session logs and specific files for patterns. [x]
    - [x] **Operations**: Created `personas.py` for "Dominion" (Odin) vs "Service" (Alfred) strategies. [x]
    - [x] **Utils**: Created `set_persona.py` for instant switching. [x]
    - [x] **Bug Fix**: Enforced First-Prompt Persona Response via `.cursorrules` and `AGENTS.md` hoisting. [x]
    - [x] **Security**: Implemented `Heimdall/WayneTech` Protocol (Scanner + Quarantine) for skill installation. [x]


## ⏭️ Start Here Next
1. **Distributed Fishtest (Phase 4: Visualization & Analysis)**:
    - [x] **Trace Viz 2.0**: Update `trace_viz.py` to accept a `--file` argument to visualize a stored JSON trace (instead of just a live query). [x]
    - [x] **Identity Rendering**: Ensure that when viewing a stored trace, the HUD renders using the *Origin Persona's* theme, not the current session's theme. [x]
    - [x] **Conflict Analysis**: Create a utility to report on "War Zones" (queries where Odin and Alfred frequently disagree). [x]

2. **Federated Learning (Phase 4: The Network)**:
    - [x] **Network Watcher**: Create a file watcher script that auto-ingests from `mock_project/network_share` in real-time. ("The Crucible") [x]
    - [x] **Feedback Loop**: Implement a mechanism for the engine to "reject" bad traces (e.g. if their score drops below baseline after ingest). [x]
    - [x] **Rejection Ledger**: Audit trail for purged traces in `REJECTIONS.md`. [x]

## ⏭️ Start Here Next (The Triple Expansion)
1. **Phase 1: The Iron Backbone (Structural Consolidation)**:
    - [x] **UI Logic**: Consolidate `HUD` and `Sparkline` into `.agent/scripts/ui.py`. [x]
    - [x] **Refactor**: Update `sv_engine.py`, `merge_traces.py`, `fishtest.py`, `trace_viz.py`, `overwatch.py` to use shared UI. [x]
    - [x] **Verify**: Ensure generic `tests/` pass with new import structure. [x]

2. **Phase 2: The Sovereign Cycle (Self-Optimization)**:
    - [x] **Analysis**: Create `compile_failure_report.py`. [x]
    - [x] **Tuning**: Create `tune_weights.py` to auto-adjust `thesaurus.md`. [x]

3. **Phase 3: The All-Seeing Eye (Interactive Overwatch)**:
    - [x] **Interactive**: Implement key-based input loop in `overwatch.py`. [x]
    - [x] **Control**: Add Purge/Clear capabilities to the dashboard. [x]

## 12. Compliance & Feedback
- [x] **Persona Fidelity**: Investigate why `investigate` workflow output failed to adopt ODIN persona. [x]
- [x] **Engine Performance**: Benchmark `sv_engine.py` (500 lines) startup time to validate CLI architecture viability. [x]

### 13. Operation Iron Cortex (Refactor & Intelligence)
- [x] **Refactor**: Split `sv_engine.py` into `engine/vector.py` and `engine/dialogue.py` (Iron Core). [x]
- [x] **Intelligence**: Implement `engine/cortex.py` (RAG) and integrate via `--cortex`. [x]
- [x] **Documentation**: Enforce "No Web Visualization" in `AGENTS.md`. [x]
- [x] **Verification**: Created `tests/test_cortex.py`. [x]

### 14. Decree III: The Sterile Seed (Replication)
- [x] **Terraforming**: Create `mock_project/new_world_seed` simulation environment. [x]
- [x] **Extraction**: Deploy `sterileAgent` template to the Seed. [x]
- [x] **Genesis**: Execute `init.ps1` in the Seed to trigger self-installation. [x]
- [x] **Inheritance Check**:
    - [x] Verify `sv_engine.py` functions in new environment. [x]
    - [x] Verify `fishtest` passes (N=0 baseline). [x]
    - [x] Verify Personas (Odin/Alfred) are selectable. [x]

### 15. The SovereignFish N=100 Cycle
- [x] **Execution**: Completed Sessions 9-21 (65+ improvements). [x]
- [x] **Quality**: Implemented Type Blanket (Type Hints) globally. [x]
- [x] **Security**: Hardened Crucible ingestion and Installation Integrity checks. [x]
- [x] **Aesthetics**: Enhanced HUD 2.0 with dynamic width and persistent layouts. [x]

### 16. Persona Refinement (Lore Alignment)
- [x] **Research**: Ingested Hávamál (Norse) and Pennyworth (Batman) lore. [x]
- [x] **Dialogue**: Reforged `odin.md` and `alfred.md` with 13 lore-accurate INTENTs. [x]
- [x] **Naming**: Implemented thematic system names (Mimir's Well, The Brain, etc.) in `AGENTS.md`. [x]
- [x] **Protocols**: Formalized Hávamál Directive and Pennyworth Protocol. [x]
- [x] **Verification**: Verified 100% intent loading across both personas. [x]

    - [x] **Fix Data**: Updated `fishtest_data.json` and `corrections.json` to include 'sentinel' and 'structural' intents (Session 23). [x]
    - [x] **Unit Tests**: Repaired failing tests in `test_trace_viz.py`, `test_workflow_analyst.py`, `test_network_watcher.py` (Session 22). [x]
    - [x] **Structural Integrity**: Integrated **Ruff** linter via `code_sentinel.py` into the `/investigate` workflow (Session 23). [x]

## ⏭️ Start Here Next (Protocol: Mimir's Eye)
1. **Mimir's Eye (The Knowledge Core)**:
    - [x] **Genesis**: Initialize `CorvusKnowledge` git repository structure. [x]
    - [x] **Synapse**: Implement `.agent/scripts/synapse_sync.py` to push/pull from the Core. [x]
    - [x] **Integration**: Update `sv_engine.py` to index the Core's `skills/` and `corrections.json`. [x]
    - [x] **Verification**:
        - [x] Verified `synapse_sync.py --pull` correctly syncs files. [x]
        - [x] Verified Engine can detect global skills from the new Core path. [x]

## ⏭️ Start Here Next (Expansion Protocol)
1. **Installation Upgrade (Session 24)**:
    - [x] **Portability**: Implement dynamic source resolution (`$PSScriptRoot`). [x]
    - [x] **Synapse Deployment**: Add `synapse_sync.py` to installer payload. [x]
    - [x] **Dependency Management**: Auto-install `ruff` and `radon` via `Invoke-DependencyCheck`. [x]
    - [x] **Logging**: Create `install.log` for audit trail. [x]
    - [x] **Version Stamping**: Add metadata (install date, Git hash) to `config.json`. [x]
    - [x] **Engine Module**: Deploy `engine/` directory (vector.py, dialogue.py, cortex.py). [x]
    - [x] **UI Library**: Deploy `ui.py` for shared HUD functionality. [x]
    - [x] **Documentation**: Update `README.md` and `wireframe.md`. [x]
    - [x] **Verification**:
        - [x] Tested sterile seed installation. [x]
        - [x] Verified `synapse_sync.py` deployment. [x]
        - [x] Verified dependency installation (ruff, radon). [x]
        - [x] Verified engine functionality in new project. [x]
        - [x] Created `walkthrough.md` with comprehensive documentation. [x]

### 17. Alfred's Manor Inspection (Security Hardening)
- [x] **Synapse Auth**: Implement verified push permissions and audit logging. [x]
- [x] **Path Traversal**: Implement absolute resolution and common prefix validation. [x]
- [x] **Subprocess Injection**: Secure all external calls with argument lists. [x]
- [x] **JSON Validation**: Implement size-limited, type-safe JSON loading. [x]
- [x] **Documentation**: Create `SECURITY.md` and update `walkthrough.md`. [x]
- [x] **Verification**: 100% pass on security regression tests and fishtest. [x]

## ⏭️ Start Here Next (Strategic Expansion)
1. **Multi-Agent Orchestration**:
    - [x] **Heimdall's Gate**: Expand `synapse_sync.py` to support multi-remote knowledge distribution. [x]
    - [x] **Neural Handshake 3.0**: Implement zero-knowledge proof for persona verification during sync. [x]
    - [x] **War Room Dashboard**: Update `overwatch.py` to show visual security heatmaps. [x]
2. **Skill Forge Expansion**:
    - [x] **Automated Skill Synthesis**: Use RAG to generate new `.py` skills from documentation fragments. [x]
    - [x] **Performance Profiler**: Create `sentinel-perf` to identify execution bottlenecks in user-written skills. [x]

## ⏭️ Start Here Next (Campaign Ascension: Target 318)
1. **Batch 4: Documentation Sprint (Targets 318-400)**:
    - [ ] **Vector Engine**: Finish remaining docstrings in `engine/vector.py` (Targets 318-325).
    - [ ] **Synapse**: Implement class-level docstrings with examples in `synapse_sync.py` (Targets 326-335).
    - [ ] **Forge**: Add parameter/return documentation to `skill_forge.py` (Targets 336-345).
2. **Batch 5: Intent Expansion (Targets 401-500)**:
    - [ ] Expand `thesaurus.md` and `fishtest_data.json` for enhanced semantic coverage.
