---
name: silver_shield
description: "Auto-sanitize sectors where the Style score drops below 6.0."
tier: SPELL
risk: safe
---

# 🔱 SPELL: THE SILVER SHIELD (v1.0)

## 💎 WHEN TO USE
Use to protect the core Kernel and Routing sectors from stylistic or structural drift. It acts as an automated "Sanitization Guard" that triggers on every neural strike (edit).

## 🛠️ EXECUTION MODE
**Agent-Native**: Agents evaluate this gate during the verification phase.

## 🧩 RECURSIVE PROTOCOL
1. **Trigger**: Detect an edit to a protected sector (e.g., `src/node/core/`).
2. **Audit**: Run `skill:linter` and `skill:calculus`.
3. **Feedback Gate**: 
    - IF `Style [S] < 6.0`: Execute `weave:restoration` (Sanitization Strike).
    - IF `Logic [L]` dropped: Rollback and Alert.
4. **Finalize**: Re-calculate Gungnir Score [Ω].

## 🔄 WEAVE CHAIN
`weave:vigilance` -> `weave:restoration` -> `skill:linter`
