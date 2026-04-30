---
name: contract_hardening
description: "Enforce Sterling Compliance across Gherkin layers."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: CONTRACT HARDENING (v1.0)

## 💎 WHEN TO USE
Use to bring a sector into 100% Sterling Compliance. This weave enforces the creation of both behavioral specs and 1:1 unit tests.

## 🛠️ EXECUTION MODE
**Agent-Native**: Agents follow this protocol manually. No TypeScript RuntimeAdapter exists for this entire chain.

## 🧩 SEQUENCE PROTOCOL
1. **Define**: Execute `skill:gherkin` to create or update the `.feature` file.
2. **Implement**: Execute `skill:empire` to run the strict TDD suite against the contract.
3. **Verify**: Execute `skill:trace` to analyze the execution path and submit the Gungnir score.
