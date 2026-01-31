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
- [x] **Distributed Fishtest**: [x]
    - [x] Refactor `sv_engine.py` for trace recording. [x]
    - [x] Update `fishtest.py` for distributed ingest (Pending Trace accumulation). [x]

### 9. SovereignFish Mandate (Session Standards)
- [x] **Refactor**: Externalize stopwords to `stopwords.json`. [x]
- [x] **Aesthetic**: Implement "Glow" effect in `HUD` class. [x]

### 10. Persona Logic & Interaction
- [x] **Initialization**: Add Persona (God/Alfred) selection to `install.ps1`. [x]
- [x] **Engine**: Implement Persona-aware HUD themes and prompts in `sv_engine.py`. [x]
- [ ] **Dialogue Expansion**: Create distinct, expanded dialogue sets for 'God' (Obtuse/Dramatic) and 'Alfred' (Humble/Helpful).


## ⏭️ Start Here Next
1. **Persona Dialogue Expansion**:
    - [ ] **Design**: Create clear voice guidelines for 'God' vs 'Alfred'.
    - [ ] **Implement**: Move hardcoded strings to a dictionary/JSON mapped by persona.
    - [ ] **Verify**: Ensure all error messages and success states reflect the chosen persona.
2. **Federated Learning (Phase 3)**:
   - [x] **Refactor**: Import `sv_engine` in `fishtest.py` (Remove subprocess) [0.00ms/call]
   - [x] **Verify**: Comparison Benchmark (100% Pass)
2. **Fishtest Scaling (Phase 2: Saturation)**:
   - [x] **Create**: `scripts/generate_tests.py` (Combinatorial Generator)
   - [x] **Generate**: Create `fishtest_N1000.json` (N=1000)
   - [x] **Verify**: Run `fishtest.py` with N=1000 dataset (~0.3ms/call)
3. **Federated Learning Pilot (Phase 3)**:
   - [x] **Simulate**: Push `agent_alpha_traces.json` to `mock_project/network_share`.
   - [x] **Ingest**: Create `tests/merge_traces.py` to update `fishtest_data.json`.
   - [x] **Verify**: Run `fishtest.py` to confirm new "Real User" coverage.
