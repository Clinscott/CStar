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
