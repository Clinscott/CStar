---
name: restoration
description: "Autonomous repair of Linscott breaches from the Hall of Records."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: RESTORATION (v1.0)

## 💎 WHEN TO USE
Use to resolve "OPEN" beads or "Linscott Breaches" in the Hall of Records. This weave automates the loop of identifying debt, proposing a fix, and recording the success.

## 🛠️ EXECUTION MODE
**Public Contract**: Host-native repair supervision.
**Bounded Executor**: `weave:restoration` remains the kernel executor for evolve and distill mechanics.

## 📥 SIGNATURE (API)
**Invocation**: `weave:restoration`

**TypeScript Payload**:
```typescript
interface RestorationWeavePayload {
    bead_ids?: string[]; // Optional: Specific sectors to fix
    epic?: string;       // Optional: Epic ID to target (e.g., 'pb-kernel')
    max_beads?: number;  // Limit the number of sectors to advance (default: 1)
    project_root: string;
}
```

## 📤 EXPECTED OUTCOME
*   Returns `WeaveResult` with `metadata.outcomes` mapping each Bead ID to its resolution status.
*   Mutates `hall_episodic_memory` upon success.

## 🧭 SUPERVISOR RULE
- The host decides whether restoration should `execute_now`, `replan`, or `observe_only`.
- The kernel remains responsible for the bounded implementation path once execution is approved.

## 🧩 INTERNAL SKILL CHAIN
`skill:hall` -> `skill:evolve` -> `skill:trace` -> `skill:distill`
