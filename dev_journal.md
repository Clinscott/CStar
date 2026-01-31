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
