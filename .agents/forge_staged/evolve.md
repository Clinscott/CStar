# /evolve

## Purpose
Triggers the Ouroboros protocol to analyze session history and optimize the Sovereign Engine's resolution logic.

## Steps
1. Load `logs/intent_feedback.jsonl`.
2. Calculate accuracy drift vs. N=1000 baseline.
3. Execute `ouroboros.evolve_weights()`.
4. Propose new Skill Templates for high-density 'Unknown' clusters.
5. Hot-reload `SovereignVector` with new graviton values.