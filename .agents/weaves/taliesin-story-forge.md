---
name: taliesin-story-forge
description: "Materialize high-fidelity manuscript chapters using the Phoenix Loop and Karpathy-hardened style instructions."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: TALIESIN STORY FORGE (v1.0)

## 💎 WHEN TO USE
Use when forging bead-backed manuscript chapters or staged narrative candidates under TALIESIN supervision.

## 🛠️ EXECUTION MODE
**Public Contract**: Host-native narrative supervision and style adjudication.
**Bounded Executor**: `weave:taliesin-forge` stages the candidate artifact from the bead-backed runtime path.

## 📥 SIGNATURE (API)
**Invocation**: `weave:taliesin-forge`

**TypeScript Payload**:
```typescript
type TaliesinForgeWeavePayload = {
    bead_id?: string;
    persona?: string;
    model?: string;
    project_root: string;
    cwd: string;
    source?: 'cli' | 'python_adapter';
}
```

## 📤 EXPECTED OUTCOME
*   Returns a staged candidate ready for downstream validation.
*   Preserves the bead, persona, and model context used to forge the manuscript output.

## 🧭 SUPERVISOR RULE
- The host owns narrative intent, style preservation, and acceptance.
- The bounded forge only materializes the candidate for the requested bead.
- Do not accept a staged draft without the downstream validation path.

## 🧩 SEQUENCE PROTOCOL
1. **Invoke**: Resolve the bead-backed narrative request.
2. **Forge**: Execute `weave:taliesin-forge` to stage the candidate chapter.
3. **Audit**: Evaluate cohesion, fidelity, and style adherence.
4. **Promote**: Advance only validated narrative candidates.
