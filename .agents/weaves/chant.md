---
name: chant
description: "Parse natural-language chants into executable skill flight paths and routing plans."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: CHANT (v1.0)

## 💎 WHEN TO USE
Use when a natural-language request must be routed into a direct capability call or promoted into a Hall-backed planning session.

## 🛠️ EXECUTION MODE
**Public Contract**: Host-native chant shell and session supervisor.
**Bounded Executors**: `weave:chant` persists routing decisions, planning state, and execution handoff beneath the host surface.

## 📥 SIGNATURE (API)
**Invocation**: `weave:chant`

**TypeScript Payload**:
```typescript
interface ChantWeavePayload {
    query: string;
    project_root: string;
    cwd: string;
    dry_run?: boolean;
    source?: 'cli' | 'python_adapter' | 'runtime';
}
```

## 📤 EXPECTED OUTCOME
*   Either resolves directly to a built-in capability, registry-backed weave, or installed skill.
*   Or creates/resumes a Hall planning session and returns the planning metadata needed for execution handoff.

## 🧭 SUPERVISOR RULE
- Keep public reasoning in the host session.
- Prefer direct routing only when the request is already bounded and unambiguous.
- Prefer the planning loop when the request is architectural, ambiguous, or multi-step.

## 🧩 SEQUENCE PROTOCOL
1. **Route**: Attempt built-in and registry-backed direct resolution.
2. **Bootstrap**: Create or resume the Hall planning session when decomposition is required.
3. **Research**: Gather codebase and environmental facts through bounded supporting skills.
4. **Adjudicate**: Hold proposals for operator review before execution release.
5. **Handoff**: Release validated beads to `weave:orchestrate`.
