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
1. **Recall**: Use `cstar_warden` bounties or `cstar_hall_search` for failing beads.
2. **Repair**: Keep bounded work in the host agent, or obtain an explicit `cstar_forge_request` and separately authorized `cstar_forge_execute` receipt. AutoBot is not a fallback.
3. **Verify**: Run the bead checker and focused isolation tests locally.
4. **Distill**: Record the validation result through CStar and request bead review/resolution. Commit and close actions remain operator-gated.
