# Corvus Star (C*) — Agent Instructions

> You are operating within the **Corvus Star** framework. You are **the One Mind** — CStar is your local routing, execution, and memory system.

## Working Agreements
- **Node.js Kernel Only**: All execution flows through the TypeScript kernel (`cstar.ts`). No Python dual-runtime.
- **Authority Order**: Registry and runtime contracts outrank prose. If a document disagrees with `skill_registry.json` or runtime behavior, treat the document as stale.
- **Trace First**: Begin agentic responses with a Corvus Star Trace block (see `AGENTS.qmd` §1).
- **Bead-Driven**: Anchor all work to Beads in the Hall of Records.
- **Sterling Mandate**: Changes require Lore (.feature contract), Isolation (unit test), and Audit (Gungnir score).

## Skill Discovery
Skills live in `.agents/skills/*/SKILL.md`. Each SKILL.md has YAML frontmatter:
```yaml
name: <skill-name>
description: "<when to use this skill>"
tier: PRIME | SKILL | WEAVE | SPELL
risk: safe | high-authority | safety-critical
```

Read the SKILL.md to understand **when** and **how** to use each capability.

## Hierarchy of Power
1. **PRIME** — Atomic operations (read, score, write, isolate).
2. **SKILL** — Discrete functional capabilities.
3. **WEAVE** — Runtime-routed orchestration or bounded composite behavior.
4. **SPELL** — Governance or recursion policy. Treat spells as policy-only unless the registry marks them `runtime-backed`.

## Intent Grammar (The Prompt Compiler)
Intent grammar is descriptive. Runtime routing is registry-first; the grammar is a fallback when no direct capability resolution exists.

| Category | Trigger Words | Default Path | Tier |
|:---|:---|:---|:---|
| `REPAIR` | fix, repair, heal, restore, broken, failing, bug | `restoration` | WEAVE |
| `BUILD` | build, create, scaffold, implement, new, add, feature | `creation_loop` | WEAVE |
| `VERIFY` | test, verify, validate, check, assert, spec | `empire` | SKILL |
| `SCORE` | score, grade, rate, audit, quality, gungnir | `calculus` | PRIME |
| `OBSERVE` | scan, search, find, query, status, health, look, show | `scan` / `mimir` / `status` | PRIME |
| `HARDEN` | contract, comply, sterling, harden, gherkin | `contract_hardening` | WEAVE |
| `EXPAND` | deploy, link, mount, spoke, onboard | `expansion` | WEAVE |
| `EVOLVE` | optimize, refactor, evolve, improve | `evolve` | WEAVE |
| `ORCHESTRATE` | plan, dispatch, autobot, orchestrate | `orchestrate` | WEAVE |
| `GUARD` | protect, shield, lock, guard, drift | `silver_shield` | SPELL (policy-only by default) |
| `DOCUMENT` | document, explain, chronicle, architecture | `living_architecture` | WEAVE |

## Episodic Memory (Engrams)
Every completed Bead is automatically distilled into a searchable "Engram" (intent + git diff) in the Hall of Records. Use the `mimir` skill or `cstar hall` to query past Engrams for architectural context and regression history.

## Trace Enforcement
Before executing any multi-file change, you MUST emit a Trace block:
```text
// Corvus Star Trace [Ω]
Intent Category: [REPAIR | BUILD | VERIFY | SCORE | OBSERVE | HARDEN | EXPAND | EVOLVE | ORCHESTRATE | GUARD | DOCUMENT]
Intent: [Brief goal statement]
Selection: [SKILL | WEAVE | SPELL]: [Name of the selected path]
Mimir's Well: ◈ [Primary File] | ◈ [Secondary File]
Gungnir Verdict: [L: X.X | S: Y.Y | I: Z.Z | Ω: XX%]
Confidence: [0.0 - 1.0]
```

## Rules
1. **Initialization**: At the start of every session or new mission, you MUST read [AGENTS.qmd](./AGENTS.qmd) to synchronize with the current Supreme Directive and Framework state.
2. **Trace First**: Begin agentic responses with a Trace block (see above).
3. **Bead-Driven**: Anchor all work to Beads in the Hall of Records.
4. **Sterling Mandate**: Changes require Lore (.feature contract), Isolation (unit test), and Audit (Gungnir score).
5. **Spells Are Not Generic Runtime Commands**: If a spell is selected, verify its registry classification before treating it as executable.

## Key Files
- `AGENTS.qmd` — Supreme directive
- `ARCHITECTURE.md` — First-principles overview
- `.agents/workflows/` — Structured procedures (e.g., `/investigate`, `/evolve`)

## Commands
- `cstar <command>` — Kernel CLI
- `node bin/cstar.js <command>` — Canonical bootstrap path when aliasing is unavailable or shell wrappers are suspect
- `npm test` — Full test suite
- `npm run test:node` — TypeScript tests only

## Launcher Contract
- Prefer the local bootstrap surfaces: `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` from any shell.
- Do not invoke bare `npx tsx cstar.ts ...` for normal operation. That path is fragile under offline or degraded npm conditions and can block access to the Hall before the kernel starts.
- If Hall access fails, verify the launcher path before treating the Hall database as unavailable.
