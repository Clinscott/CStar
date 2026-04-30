---
name: hunt
description: "Use when finding missing capabilities, evaluating external skill sources safely, and ingesting approved logic."
risk: safe
source: internal
---

# 🔱 WILD HUNT SKILL (v1.0)

## When to Use
- Use when finding missing capabilities, evaluating external skill sources safely, and ingesting approved logic.


## MANDATE
Scour digital realms for techniques and skills, forging them directly into the One Mind. Ingests remote repositories into active skills (`.agents/skills`) with strict physical isolation safeguards.

## LOGIC PROTOCOL
1. **TARGET ACQUISITION**: Search local databases or the broader internet (Brave/Google) for missing capabilities.
2. **TRUST VERIFICATION**: Check if the source repository belongs to a trusted namespace (e.g., Google, Gemini-CLI).
3. **SHADOW FORGE**: If untrusted, clone into an isolated staging directory and evaluate using the Sandbox Warden.
4. **PROMOTION**: If deemed secure and functional, promote the acquired logic into the active Corvus Star matrix.

## USAGE
`cstar hunt --search <query>`
`cstar hunt --ingest <url> --name <skill_name>`
