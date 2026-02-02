# Wireframe Maintenance Instructions

The `wireframe.md` file acts as the project's map. It provides future agents and developers with an immediate understanding of the project's structure, component locations, and key logic.

## Goal
Maintain a searchable, accurate map of the project's UI and service architecture.

## Maintenance Rules
1. **Document Every New Component**: Whenever you create a new UI component or major service, add its entry to `wireframe.md`.
2. **File Paths**: Use absolute or clear relative paths for every entry so they are easily locatable.
3. **Prominent Functions**: For each component, explicitly name and describe 2-3 key functions.
   - *Example*: `handleSubmit()`: Validates registration form and triggers API call.
4. **Project Directory Structure**: Keep a high-level list of key directories and their purposes.
5. **No Placeholders**: If a component exists, it must be documented. If it's deleted, remove it from the map.

# Project Map / Wireframe

## 📂 Directory Structure
- `.agent/scripts`: SovereignVector Engine (sv_engine.py)
- `.agent/skills`: Specialized Agent Skills (SKILL.md definitions)
- `.agent/workflows`: Core AgLng Workflows (lets-go, run-task, etc.)
- `sterileAgent`: Generic template repository for new project initialization.
- `skills_db`: Global Skill Registry for proactive framework recommendations.
- `skills`: (Optional) Project-specific custom skills.

## 🏗️ Core Components

### SovereignVector Engine
- **Path**: `.agent/scripts/sv_engine.py`
- **Description**: High-performance local TF-IDF vector matching script.
- **Key Functions**:
    - `search(query)`: Maps natural language to local and global (proactive) skill triggers.
    - `expand_query()`: Handles synonyms and stemming via `thesaurus.md`.
    - `propose_immediate_install`: Generates JIT installation commands for high-confidence global matches (>0.85).
    - **Proactive Recommendation**: Scours Global Registry if `config.json` provides `FrameworkRoot`.
    - **Correction Path**: Short-circuits vector search if query matches `.agent/corrections.json`. Returns score of 1.1.
    - **HUD Class**: Visual rendering engine. Updated to support dynamic `color` overrides for Persona Symmetry.
    - **Backbone**: `ui.py` is the centralized UI library for all scripts (HUD, Sparklines, Boxes). Hardened with strict typing and docstrings.

### Testing Protocol (Fishtest)
- **Path**: `fishtest.py`
- **Logic**: Statistical validator comparing `actual` results against `fishtest_data.json`.
- **Duality Implementation**:
    - **ODIN (The Crucible)**: Success is Survival. SPRT culls regressions with zero tolerance.
    - **ALFRED (Integrity Briefing)**: Success is Insight. SPRT provides suggestions for improvement.
- **Verification Parameters**:
    - `min_score`: Minimum confidence threshold (Standard: 0.85).
    - `expected_mode`: Resolution logic type (`vector` or `correction`).
    - `is_global`: Context source verification.

### Skill Management
- **Path**: `.agent/scripts/install_skill.py`
- **Description**: Utility to deploy skills from the Global Registry to the local project.
- **Persona Switcher**: `.agent/scripts/set_persona.py` - interactive utility to toggle between ODIN and ALFRED modes.
- **Persona Strategies**: `.agent/scripts/personas.py`
    - **ODIN Strategy**: Dominion & Enforcement. Ruthless standardization of headers, AgLng compliance, and testing mandates.
    - **ALFRED Strategy**: Service & Facilitation. Provisioning of backups, adaptive structural learning, and humble refinement.
- **Dialogue Database**: `dialogue_db/` - Markdown corpus for vector-based speech generation (`odin.md`, `alfred.md`).

### 🌓 The Great Duality (Operational Architecture)
The framework's soul (The Linscott Standard) manifests through two distinct operational minds:
1. **Compliance (ODIN)**: Focuses on **Structural Rigidity**. Operates via "Decrees" and "Dominion Audits". Overwrites for Standard.
2. **Service (ALFRED)**: Focuses on **Adaptive Support**. Operates via "Briefings" and "Manor Polish". Backups for Safety.

### Corvus Star Workflows
- **Path**: `.agent/workflows/[name].md`
- **Description**: Markdown execution plans triggered by C*.
- **Key Files**:
    - `SovereignFish.md`: Protocol of incremental excellence. Supports **ODIN: Dominion Audit** (SECURED) and **ALFRED: Manor Polish** (IMPROVED).
    - `wrap-it-up.md`: Session finalization and documentation logic.
    - `SovereignFish Protocol`: Enforced differently per persona (Audit vs. Polish).

### Neural Trace Tools (Triple Threat)
- **Trace Visualizer**: `.agent/scripts/trace_viz.py`
    - **Identity Rendering**: Dynamic ASCII/Color shifting (Red for Odin, Cyan for Alfred).
    - **War Room**: Logic to compare traces and detect "Faction Wars" (Odin vs Alfred conflicts).
- **Trace Compiler**: `.agent/scripts/compile_session_traces.py` - Aggregates JSON traces into `.agent/TRACE_REPORT.md`.
- **Global Registry**: `skills_db/` - Central repository for `git-assistant`, `codestats`, `agent-health`, and more.

### Fishtest Scaling & Federation Tools
- **Test Generator**: `.agent/scripts/generate_tests.py` - Combinatorial generator for producing N-scale synthetic datasets (`fishtest_N1000.json`).
- **Trace Ingest**: `.agent/scripts/merge_traces.py` - Core script for merging external agent traces. Implements "Real User Wins" conflict resolution.
- **Network Watcher**: `.agent/scripts/network_watcher.py` - "The Crucible". Autonomously watches `mock_project/network_share`, ingests traces, runs fishtest, and Commits (Processed) or Purges (Quarantine) based on result. Updated with **Law of Latency** to reject traces causing >5ms regression.
- **Latency Benchmark**: `.agent/scripts/latency_check.py` - Optimized utility for measuring engine startup performance.
- **Neural Overwatch**: `.agent/scripts/overwatch.py` - Real-time terminal dashboard for monitoring the Federated Network, latency trends, and "War Zones". Hardened with `msvcrt` safety checks.
- **Ingest Verification**: `tests/test_merge_traces.py` - Permanent regression suite for ingestion logic.
- **UI Verification**: `tests/test_ui.py` - Unit tests for the shared UI library.
- **Network Share**: `mock_project/network_share/` - Simulated folder for multi-agent trace exchange.
- **Crucible Directories**: `.agent/traces/processed` (Safe Haven), `.agent/traces/quarantine` (Purged Weakness).

## 🌐 Federated Learning Infrastructure
The framework supports cross-agent intelligence sharing via the "Federated Network" protocol.

### Real-Time Ingestion (The Crucible)
- **Watcher**: `.agent/scripts/network_watcher.py`
    - Monitors `network_share/` for incoming JSON traces.
    - Implements an atomic "Trial and Rollback" cycle:
        1. **Stage**: Moves trace to staging for isolation.
        2. **Merge**: Ingests into `fishtest_data.json` via `merge_traces.py`.
        3. **Ordeal**: Executes `fishtest.py` to verify accuracy integrity.
        4. **Verdict**: If pass, commits data. If fail, rolls back `fishtest_data.json` and purges trace.
- **Rejection Ledger**: `.agent/traces/quarantine/REJECTIONS.md`
    - Audit trail of failed ingestion attempts, including persona and reason (e.g., Regression, Format Error, Latency Breach).

### Conflict Resolution
- **Logic**: Implemented in `merge_traces.py`.
- **Primary Rule**: **Real User Wins**. External trace data (real-world usage) overrides existing synthetic test cases or older traces.
- **Persistence**: Successful merges are archived in `.agent/traces/processed` to prevent re-ingestion loops.
