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

## Exported Codex Capabilities (67)
- `_archive` (SKILL)
- `agentic-ingest` (PRIME)
- `annex` (SKILL)
- `autobot` (SKILL)
- `bifrost` (SKILL)
- `bookmark-weaver` (SKILL)
- `cachebro` (SKILL)
- `calculus` (PRIME)
- `chant` (WEAVE)
- `chronicle` (SKILL)
- `consciousness` (SKILL)
- `contract_hardening` (WEAVE)
