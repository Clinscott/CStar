# Developer Journal Instructions

The `DEV_JOURNAL.md` file records the chronological evolution of the project, focusing on architectural decisions, breakthroughs, and persistent challenges.

## Goal
Preserve the "why" behind technical decisions and provide a narrative history of the project's development.

## Maintenance Rules
1. **Daily/Session Entries**: Create a new entry for every session where significant progress or decisions are made.
2. **High-Level Summary**: Start with a summary of what was accomplished.
3. **Architectural Decisions**: Document why a specific pattern, library, or structure was chosen.
4. **Breakthroughs & Fixes**: Record solved bugs that were particularly complex or non-obvious.
5. **Current State**: Briefly describe the state of the project at the end of the session.

# Developer Journal

## 2026-01-30 - Intelligent Handshake & Skill Proactivity
### Summary
- Enhanced `install.ps1` with "Intelligent Handshake": Non-destructive installation with interactive conflict resolution (Skip, Overwrite, Merge, Diff).
- Implemented **Global Skill Registry** (`skills_db/`) for framework-wide skill sharing.
- Updated `SovereignVector` (sv_engine.py) with proactive recommendations:
    - >90% confidence triggers an immediate `PROPOSE_INSTALL` command.
    - >50% confidence generates a tiered recommendation report.
- Fixed critical encoding bugs (UTF-16LE vs UTF-8 BOM) in PowerShell-Python interoperability.

### Architectural Decisions
- **BOM-less UTF-8**: Standardized on BOM-less UTF-8 for all configuration and content files to ensure silent failure-free JSON loading in Python.
- **JIT Skill Deployment**: Decided on a "Just-in-Time" installation model for skills to prevent local project bloat while maintaining expert capabilities.
- **Simple Handshake Commands**: Optimized interactive prompts for speed (single-letter commands) as per user feedback.

### Current State
- Framework is fully portable and robust.
- Discovery engine is proactive and intelligent.
- System is ready for a visual "Sci-Fi" UI overhaul of the tracer.

## 2026-01-30 - Corvus Star & The Triple Threat
### Summary
- **Rebranded**: Officially renamed AgLng to **Corvus Star (C*)** globally.
- **Aesthetic Overhaul**: Implemented a `HUD` class in `sv_engine.py` to drive a "Sci-Fi" terminal interface with box drawing and progress bars.
- **Skill Expansion**: Added `agent-lightning` (RL Optimization) and `playwright-e2e` (Testing) to the global registry.
- **Robustness**: Upgraded `install.ps1` with "Smart-Merge 2.0" (section awareness) and automatic `.bak` backups.

### Architectural Decisions
- **Terminal UI as "Product"**: Decided that for a CLI tool, the terminal output *is* the product UI. Treating it with the same care as a React frontend (styling, components) increases perceived value.
- **Sidecar Optimization**: Chose to implement "Agent Lightning" as a skill rather than a core dependency, keeping the C* core lightweight while allowing advanced users to opt-in to RL optimization.
- **Aggressive Safety**: Added automatic backups to the installer. In a tool meant to "inject" code into existing projects, safety is the primary feature.

### Current State
- **Corvus Star 1.0** is visually distinct and operationally safer.
- The Skill Registry now contains 3 powerful capabilities (Search, Optimization, Testing).
- The installer is robust enough for "production" usage.

## 2026-01-30 - Triple Threat Execution Phase
### Summary
- **Interactive Reactivity**: Enabled `sv_engine.py` to accept user input (Y/n) for immediate JIT skill installation, closing the "Proactive" loop.
- **Agent Lightning PoC**: Created `lightning_rod.py` to demonstrate the read-optimize-write loop using the new HUD.
- **Template Synchronization**: Propagated the HUD and Smart-Merge 2.0 capabilities to `sterileAgent`, ensuring future projects inherit these standards.

### Architectural Decisions
- **Interactive CLI**: Added `input()` handling in `sv_engine.py`. While risky in some automation contexts, the high-confidence threshold (>0.9) ensures it only triggers when impactful.
- **Separation of Concerns**: Kept `lightning_rod.py` separate from `sv_engine.py` to ensure the "Discovery" engine relies only on reading, while the "Optimization" engine handles writing.

### Current State
- Corvus Star 1.1 is live.
- The framework is now capable of *acting*, not just suggesting.
