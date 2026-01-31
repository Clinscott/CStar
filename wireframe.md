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

### Testing Protocol (Fishtest)
- **Path**: `fishtest.py`
- **Logic**: Statistical validator comparing `actual` results against `fishtest_data.json`.
- **SPRT Implementation**: Uses Log-Likelihood Ratio (LLR) to calculate statistical confidence (H1 vs H0) for engine improvements.
- **Verification Parameters**:
    - `min_score`: Minimum confidence threshold (Standard: 0.85).
    - `expected_mode`: Resolution logic type (`vector` or `correction`).
    - `is_global`: Context source verification.

### Skill Management
- **Path**: `.agent/scripts/install_skill.py`
- **Description**: Utility to deploy skills from the Global Registry to the local project.

### Agent Lightning (PoC)
- **Path**: `.agent/scripts/lightning_rod.py`
- **Description**: Proof-of-concept optimization loop for self-improving code.

### Corvus Star Workflows
- **Path**: `.agent/workflows/[name].md`
- **Description**: Markdown execution plans triggered by C*.
- **Key Files**:
    - `SovereignFish.md`: The protocol of incremental excellence.
    - `wrap-it-up.md`: Session finalization and documentation logic.
