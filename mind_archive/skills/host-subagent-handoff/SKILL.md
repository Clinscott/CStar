---
name: host-subagent-handoff
description: "Use when delegating CStar bead work to host-native specialist roles instead of a generic worker surface."
risk: safety-critical
source: internal
---

# 🔱 HOST SUBAGENT HANDOFF

## Mandate
Route delegated host work through a named specialist profile before invoking the active host provider.
The control plane chooses the role. The transport only carries it.

## Core Roles
- `architect`: planning, decomposition, sequencing, provider-fit
- `backend`: server/runtime implementation
- `frontend`: UI/component implementation
- `reviewer`: critique and regression analysis
- `tester`: verification and checker shaping
- `debugger`: failure isolation and narrow repairs
- `security`: auth, trust boundaries, auditability
- `documenter`: docs and behavioral contracts
- `devops`: workflow and environment plumbing
- `refactorer`: structural cleanup without behavior drift
- `performance`: hot-path and latency work
- `api_designer`: interface and contract shape
- `scout`: reconnaissance and evidence gathering

## Runtime Rule
1. Resolve the bead into a specialist profile.
2. Persist the profile in the delegated execution request.
3. Prefer provider-native subagent/delegate bridges when the host supports them.
4. If the host lacks a real subagent API, preserve the same profile through the prompt envelope rather than dropping back to a generic worker.

## Anti-Pattern
Do not infer execution solely from the shell command. The authoritative decision is the specialist profile selected by CStar.
