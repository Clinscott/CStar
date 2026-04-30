---
name: start
description: "Awaken the system pulse, initiate agent loops, and bootstrap the runtime."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: START (v1.0)

## 💎 WHEN TO USE
Use when awakening Corvus Star, resuming host governance, or bootstrapping the runtime dispatcher from the public start surface.

## 🛠️ EXECUTION MODE
**Public Contract**: Host-supervised startup and governance wake.
**Bounded Executor**: `weave:start` remains the kernel executor for estate update hooks, provider resolution, and optional governor resume.

## 📥 SIGNATURE (API)
**Invocation**: `weave:start`

**TypeScript Payload**:
```typescript
interface StartWeavePayload {
    target?: string;
    task: string;
    ledger: string;
    loki?: boolean;
    debug?: boolean;
    verbose?: boolean;
}
```

## 📤 EXPECTED OUTCOME
*   Wakes the runtime spine and returns either a wake-only result or a host-governor resume result.
*   Preserves the startup decision path for later recovery and supervision.

## 🧭 SUPERVISOR RULE
- Treat `cstar start` as a supervisory decision surface, not as a blind local bootstrap.
- Resume host governor only when the active host/session path supports governed execution.
- Kernel wake mechanics remain bounded runtime work.

## 🧩 SEQUENCE PROTOCOL
1. **Ceremony**: Run startup validation and estate update hooks.
2. **Resolve**: Detect the active host provider and startup mode.
3. **Awaken**: Bootstrap dispatcher and registered adapters.
4. **Resume**: Hand off to host governor when governed execution is warranted.
