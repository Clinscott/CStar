```yaml
saved_memory:
  version: 1
  updated: 2026-01-30
  settings:
    enabled: true
    announce_writes: true
  items:
    - Corvus Star (C*): Formerly AgLng. Plain-English-to-Workflow mapping using SovereignVector.
    - Aesthetic Standard: CLI tools must use the `HUD` class for Box-Drawing/Color/Progress output. "Text is User Interface."
    - Smart-Merge 2.0: Installation script supports section-aware merging and automatic backups.
    - SovereignVector: Local Python engine for intent recognition; supports tiered proactive recommendations (>90% triggers JIT install).
    - Intelligent Handshake: Non-destructive installation script (`install.ps1`) with interactive conflict resolution (O/S/M/D).
    - Global Registry: Centralized `skills_db/` in `CorvusStar` for cross-project capability sharing.
    - Encoding Rule: Use BOM-less UTF-8 for all Inter-agent configs (JSON/MD) to avoid PowerShell/Python encoding conflicts.
    - Interaction Pattern: High-confidence (>90%) local intent matches should trigger an interactive confirmation (Y/n) rather than just a proposal.
    - Lightning Protocol: File optimization skills should follow a Read -> HUD -> Modify -> Report loop (as seen in `lightning_rod.py`).
    - SovereignFish Mandate: Use the `SovereignFish` protocol EVERY session to implement 2 minor improvements (visual/code) that are NOT in the prompt.
    - The 85% Bar: Execution-level triggers must meet an 85% confidence score. Core workflows should be hard-mapped in `corrections.json` for 110% (1.10) confidence.
    - Intent Polarity: Use Vector Search for *Discovery* (finding new skills) and Corrections for *Execution* (triggering established workflows).
    - Fishtest Protocol 2.0: Tests must verify `min_score`, `is_global`, and `expected_mode` to be considered passing.
    - Weighted Nuance: Use `word:weight` in `thesaurus.md` (e.g., `go:0.5`) to dampen broad synonyms and preserve engine precision.
    - SPRT Standard: Sequential Probability Ratio Test (LLR-based) is the project's statistical verification standard for engine-level improvements.
    - Stemming Rule: Automated stemming for `-ing`, `-ed`, `-es`, `-s` suffixes is applied with a 0.8 weight to prevent noise in small datasets.
    - Neural Tracing: `trace_viz.py` is the standard tool for inspecting engine logic. It uses the "Glow" HUD aesthetic.
    - Stopword Policy: Stopwords must be externalized to `stopwords.json` to keep engine logic clean and allow for easy language swapping.
    - Trace Archiving: `TRACE_REPORT.md` must only show the CURRENT session's traces. Processed traces are moved to `traces/archive/`.
    - Real User Wins: In conflict resolution (Federated Learning), actual user trace data always overrides synthetic or theoretical test cases.
    - Scalability Benchmark: The testing infrastructure is certified for N=1000 execution at <0.5ms per call.
    - Learning by Memorization: High-value failing traces should be added directly to `corrections.json` for immediate resolution.
    - Persona Pattern: Store personality/voice settings in `config.json` and use a centralized theme dictionary (like `_get_theme()`) to drive CLI aesthetics dynamically.
    - Operational Divergence: Use the Strategy Pattern (`Personas.py`) to map "Soul" to "Behavior". ODIN = Strict Enforcement; ALFRED = Adaptive Service.
    - Vector Dialogue: Store system responses in markdown corpora (`dialogue_db/`) to be retrieved by semantic intent, not hardcoded strings.
    - Metadata Tagging: Use flexible `tags` arrays in test/trace data to store origin metadata (like Persona) rather than rigid schema columns.
deletions: []
```
