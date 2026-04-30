---
name: gatekeeper
description: "The enforcer of Gungnir Law. Manages filesystem locks and Git hooks to prevent the commit of toxic logic."
risk: high-authority
source: internal
---

# 🔱 SKILL: GATEKEEPER (v1.0)

## 💎 WHY TO USE
Use to physically prevent the corruption of the master branch. The Gatekeeper ensures that the Triad of Verification is not just a suggestion, but a requirement for state change.

## 🛠️ HOW TO USE
Invoke to synchronize the Git `pre-commit` hook with the Gungnir Ω score.

## 📥 SIGNATURE (API)
**Command**: `cstar engine --lock` or `python3 scripts/gatekeeper.py --sync-hooks`

**Arguments**:
*   `--enforce-score <min_score>` (default: 6.0): Rejects commits if the target's [Ω] is below this threshold.
*   `--lock-sector <path>`: Place a physical lock on a directory during a forge cycle.

**Output**:
*   Updated `.git/hooks/pre-commit`.
*   Filesystem lock state in `.agents/locks/`.

## 📁 FILEPATH
- **Mandate**: `.agents/skills/gatekeeper/SKILL.md`
- **Implementation**: `src/node/core/runtime/weaves/host_bridge.ts` (Lock Logic)
