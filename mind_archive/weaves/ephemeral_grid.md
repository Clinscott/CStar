---
name: ephemeral_grid
description: "Manage distributed AutoBot execution queues."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: EPHEMERAL GRID (v1.0)

## 💎 WHEN TO USE
Use when dispatching tasks to parallel, ephemeral AutoBots. This weave handles the queueing, worker spawning, and result aggregation.

## 🛠️ EXECUTION MODE
**Kernel-Backed**: Must be dispatched via the Node.js `RuntimeDispatcher` using adapter `weave:ephemeral_grid`.

## 📥 SIGNATURE (API)
**Invocation**: `weave:ephemeral_grid`

**TypeScript Payload**:
```typescript
interface EphemeralGridWeavePayload {
    task_intent: string; // The high-level intent to execute
    max_workers?: number; // Maximum concurrent workers (default: 3)
    project_root: string;
}
```

## 🧩 INTERNAL SKILL CHAIN
`skill:locks` -> `skill:autobot` -> `skill:distill` -> `skill:scribe`
