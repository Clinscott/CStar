---
name: oracle-search
description: Repository-aware technical analysis and intent generation. Use when you need to understand the architectural intent of a file or module, generate technical requirements, or reconcile conflicting implementations across the estate.
---

# 🔱 Oracle Search Skill [Ω]

This skill provides high-fidelity repository intelligence by grounding analysis in the "One Mind" and the Hall of Records.

## When to Use

- Use when you need to understand *why* a piece of code was written a certain way (intent).
- Use to generate technical requirements for a new bead or feature.
- Use to reconcile architectural inconsistencies across different spokes or repositories.

## Logic Protocol

1.  **Context Synchronization**: Access the Gungnir Matrix and Hall of Records for grounded analysis.
2.  **Intent Discovery**: Identify the primary technical purpose and interaction protocol of the target code.
3.  **Cross-Spoke Analysis**: Determine how a change in the current repository affects other parts of the estate.
4.  **Delivery**: Provide a technical, concise report on the findings.

## Constraints

- Focus on **intent**, not just implementation.
- Avoid broad repo-wide narration; stay focused on the specific query or target.
- Use only the latest 32k of relevant context (Gungnir scores, Hall summaries, episodic memory).
