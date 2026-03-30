---
name: expansion
description: "Onboard and topology-scan new Spoke repositories."
tier: WEAVE
risk: safe
---

# 🔱 WEAVE: EXPANSION (v1.0)

## 💎 WHEN TO USE
Use when mounting a new repository (Spoke) into the Corvus Star Estate. This weave automates the linking, initial structural scan, and architectural mapping.

## 🛠️ EXECUTION MODE
**Public Contract**: Host-native onboarding supervision.
**Bounded Executor**: `weave:expansion` remains the kernel executor for import, scan, and topology mechanics.

## 📥 SIGNATURE (API)
**Invocation**: `weave:expansion`

**TypeScript Payload**:
```typescript
interface EstateExpansionWeavePayload {
    remote_url: string; // The Git URL of the repository to link
    slug?: string;      // Optional: Unique slug for the spoke
    project_root: string;
}
```

## 📤 EXPECTED OUTCOME
*   New entry in `hall_mounted_spokes`.
*   Complete FTS5 index in `hall_files` for the new spoke.
*   Updated `matrix-graph.json` reflecting the new node.

## 🧭 SUPERVISOR RULE
- The host decides whether expansion should `execute_now`, `replan`, or `observe_only`.
- The kernel remains responsible for the bounded import, scan, and topology path once execution is approved.

## 🧩 INTERNAL SKILL CHAIN
`skill:spoke` -> `skill:scan` -> `skill:agentic-ingest` -> `skill:matrix`
