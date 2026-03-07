# Workflow: Forge-Init

## Purpose
Initiate the Recursive Skill Synthesis cycle. This workflow scans the `intent_failures.jsonl` and prompts the One Mind to generate new capability bridges.

## Steps
1. Analyze `logs/intent_failures.jsonl` for high-density clusters.
2. Invoke `SkillForge.synthesize_bridge()` for identified clusters.
3. Register new bridges into the `Shadow Engine` TF-IDF memory.
4. Validate bridge integrity via `/test`.