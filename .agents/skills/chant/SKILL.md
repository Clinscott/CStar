---
name: chant
description: "Use when parsing natural-language chants into executable skill flight paths and routed execution plans."
risk: safe
source: internal
---

# 🔱 COGNITIVE CHANT SKILL (v1.0)

## When to Use
- Use when parsing natural-language chants into executable skill flight paths and routed execution plans.


## MANDATE
Parse natural language "Chants" into dynamic execution plans (Flight Paths) of Agent Skills. Act as the primary Cognitive Router for Huginn and Muninn.
Phase 1 authority: `cstar chant "<query>"` now resolves through the woven runtime.
The Python script in `scripts/chant.py` is a compatibility adapter only.

## LOGIC PROTOCOL
1. **INTENT DECODING**: Consult the One Mind to translate the Shaman's chant into a series of technical objectives.
2. **SKILL MAPPING**: Identify the optimal sequence of Agent Skills required to fulfill the objectives.
3. **CEREMONIAL EXECUTION**: Trigger the `ritual` skill to visualize the plan, then execute each skill in sequence.
4. **MISSION FEEDBACK**: Monitor the success of each step and adjust the flight path if anomalies are detected.

## USAGE
`cstar chant "<query>"`
