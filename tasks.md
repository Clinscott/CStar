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

## ⏭️ Future Roadmap
1. **Distributed Fishtest**: Explore a distributed testing model where agents can contribute traces to a central `fishtest_data.json` repository.
2. **Global Expansion**: Ingest 3-4 more high-value skills into `skills_db`.
3. **Trace Visualizer**: Create a CLI tool to visualize the TF-IDF vector of a query vs a match.
