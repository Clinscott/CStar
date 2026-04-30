---
name: secure_speculation
description: "Safely theorize and run bounded tests against legacy sectors."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: SECURE SPECULATION (v1.0)

## 💎 WHEN TO USE
Use when researching or executing untrusted external code. This weave ensures the host system is protected from side-effects and data leaks.

## 🛠️ EXECUTION MODE
**Agent-Native**: Agents follow this protocol manually. No TypeScript RuntimeAdapter exists for this entire chain.

## 🧩 SEQUENCE PROTOCOL
1. **Research**: Execute `skill:research` to identify target code.
2. **Isolate**: Execute `skill:jailing` to spin up a Docker sandbox.
3. **Execute**: Run the code inside the jail constraint.
4. **Cleanse**: Execute `skill:redactor` to strip secrets from the output.
