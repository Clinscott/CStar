---
name: ravens
description: "Coordinate autonomous repository improvement by selecting debt targets."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: RAVENS (v1.0)

## 💎 WHEN TO USE
Use when supervising autonomous maintenance, debt reduction, or bounded sweep cycles across the brain or mounted spokes.

## 🛠️ EXECUTION MODE
**Public Contract**: Host-native maintenance supervision.
**Bounded Executors**: `weave:ravens` normalizes action intent and delegates cycle mechanics to `weave:ravens-cycle` and related stage primitives.

## 📥 SIGNATURE (API)
**Invocation**: `weave:ravens`

**TypeScript Payload**:
```typescript
type RavensAction = 'start' | 'stop' | 'status' | 'cycle' | 'sweep';

interface RavensWeavePayload {
    action: RavensAction;
    shadow_forge?: boolean;
    spoke?: string;
}
```

## 📤 EXPECTED OUTCOME
*   Returns observation, lifecycle status, or bounded maintenance execution against the selected scope.
*   Records the chosen target and maintenance outcome for downstream Hall traceability.

## 🧭 SUPERVISOR RULE
- The host decides whether Ravens should observe only or execute immediately.
- Scope selection belongs to the public host surface.
- Sweep and cycle mechanics remain bounded kernel work.

## 🧩 SEQUENCE PROTOCOL
1. **Normalize**: Interpret the requested maintenance action.
2. **Target**: Select the brain or a mounted spoke.
3. **Consult**: Shape the repair intent against debt and oracle context.
4. **Cycle**: Delegate bounded execution to `weave:ravens-cycle`.
5. **Record**: Persist verified maintenance traces back to the Hall.
