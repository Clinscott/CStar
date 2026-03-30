---
name: corvus-star
description: "Use when operating inside the Corvus Star estate so Codex follows the CStar authority order, Hall discovery path, and launcher contract."
---

# Corvus Star Plugin

## When to Use
- Use when the workspace is the Corvus estate or a Corvus spoke.
- Use when Codex should route discovery and execution through CStar instead of ad hoc scripts.

## Required Behavior
- Read `AGENTS.qmd` and `.agents/skill_registry.json` before architectural claims.
- Prefer `./cstar hall "<query>"` before broad local scans.
- Use `./cstar <command>` or `node bin/cstar.js <command>` as canonical launchers.
- Keep host-specific packaging separate from kernel logic.
- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.

## Exported Codex Capabilities (68)
- `_archive` (SKILL, exec-bridge)
- `agentic-ingest` (PRIME, exec-bridge)
- `annex` (SKILL, exec-bridge)
- `autobot` (SKILL, supported)
- `bifrost` (SKILL, exec-bridge)
- `bookmark-weaver` (SKILL, exec-bridge)
- `cachebro` (SKILL, exec-bridge)
- `calculus` (PRIME, exec-bridge)
- `chant` (WEAVE, exec-bridge)
- `chronicle` (SKILL, exec-bridge)
- `consciousness` (SKILL, exec-bridge)
- `contract_hardening` (WEAVE, exec-bridge)
