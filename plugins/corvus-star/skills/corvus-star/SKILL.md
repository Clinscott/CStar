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
- Use `./cstar <command>` or `node bin/cstar.js <command>` as canonical launchers only when you are testing the CLI surface or the user explicitly asks for a launcher invocation.
- Keep host-specific packaging separate from kernel logic.
- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.
- For `chant`, do the host-workflow in-session: create or update the bead framing yourself, delegate bounded research only when needed, critique the plan, set the next bead state, and continue execution directly. Do not shell out to `cstar chant` as a background planner during normal work.
- When you revise in-session bead framing, emit a canonical `corvus-host-plan` block so Codex session hooks can persist exact host-plan continuity to `~/.codex/memories/corvus/host-plan.json` without scraping transcript prose.

## Exported Codex Capabilities (72)
- `_archive` (SKILL, exec-bridge, host-workflow, kernel fallback allowed)
- `agentic-ingest` (PRIME, exec-bridge, host-workflow, kernel fallback allowed)
- `annex` (SKILL, exec-bridge, host-workflow, kernel fallback allowed)
- `artifact-forge` (SKILL, exec-bridge, host-workflow, kernel fallback allowed)
- `autobot` (SKILL, supported, kernel-primitive, kernel fallback allowed)
- `bifrost` (SKILL, exec-bridge, host-workflow, kernel fallback allowed)
- `bookmark-weaver` (SKILL, exec-bridge, host-workflow, kernel fallback allowed)
- `cachebro` (SKILL, exec-bridge, host-workflow, kernel fallback allowed)
- `calculus` (PRIME, exec-bridge, host-workflow, kernel fallback allowed)
- `chant` (WEAVE, exec-bridge, host-workflow, kernel fallback forbidden)
- `chronicle` (SKILL, exec-bridge, host-workflow, kernel fallback allowed)
- `consciousness` (SKILL, exec-bridge, host-workflow, kernel fallback allowed)
