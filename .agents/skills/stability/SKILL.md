---
name: stability
description: "Use when tracking edit fatigue and oscillation to prevent recursive or conflicting repair loops."
risk: safe
source: internal
---

# 🔱 STABILITY MANAGER SKILL (v1.0)

## When to Use
- Use when tracking edit fatigue and oscillation to prevent recursive or conflicting repair loops.


## MANDATE
Protect the repository timeline by tracking file edit fatigue, preventing oscillation (edit wars), and maintaining environmental awareness.

## LOGIC PROTOCOL
1. **FATIGUE TRACKING**: Record every edit and failure per sector in the sovereign state.
2. **OSCILLATION PREVENTION**: Identify sectors with high edit counts or rapid failures and escalate them to `BLOCKED_STUCK`.
3. **ENVIRONMENTAL AWARENESS**: Monitor the time since last edit to respect repository silence.
4. **TIMELINE GUARDIANSHIP**: Ensure that autonomous repairs do not enter infinite recursive loops.

## USAGE
`cstar stability --audit --file <path>`
`cstar stability --record --file <path> --success <bool>`
