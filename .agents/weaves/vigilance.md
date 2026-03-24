---
name: vigilance
description: "Continuously audit the estate against Gungnir standards."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: VIGILANCE (v1.0)

## 💎 WHEN TO USE
Use to perform a comprehensive audit of the system perimeter. This weave releases the Raven wardens to detect anomalies and updates the Chronicle state map.

## 🛠️ EXECUTION MODE
**Kernel-Backed**: Must be dispatched via the Node.js `RuntimeDispatcher` using adapter `weave:vigilance`.

## 📥 SIGNATURE (API)
**Invocation**: `weave:vigilance`

**TypeScript Payload**:
```typescript
interface VigilanceWeavePayload {
    spoke?: string;      // Optional: Specific spoke to audit
    aggressive?: boolean; // Toggle high-fidelity static analysis
    project_root: string;
}
```

## 📤 EXPECTED OUTCOME
*   Updated `VIGILANCE_SWEEP_REPORT.json`.
*   New anomaly beads injected into PennyOne if breaches are found.
*   Synchronized `state_map.json` in the Chronicle directory.

## 🧩 INTERNAL SKILL CHAIN
`skill:ravens` -> `skill:warden` -> `skill:chronicle` -> `skill:hall`
