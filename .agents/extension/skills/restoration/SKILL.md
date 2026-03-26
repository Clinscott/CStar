---
name: restoration
description: Autonomous repair of Linscott breaches from the Hall of Records. Use to resolve "OPEN" beads or "Linscott Breaches".
---

# 🔱 WEAVE: RESTORATION (v1.0)

## 💎 WHEN TO USE
Use to resolve "OPEN" beads or "Linscott Breaches" in the Hall of Records. This weave automates the loop of identifying debt, proposing a fix, and recording the success.

## 🛠️ EXECUTION MODE
**Agent-Native Weave**: This weave is executed natively by the host agent.

## 🧩 INTERNAL SKILL CHAIN
1. **Recall**: Use `mcp_pennyone_get_technical_debt` or search the Hall for failing beads.
2. **Evolve**: Delegate the target bead to the `autobot` subagent for repair using `delegate_to_subagent("autobot")`.
3. **Verify**: Ensure tests pass locally (Isolation Verification).
4. **Distill**: Generate a commit and close the bead.