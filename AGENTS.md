# Corvus Star (C*) — Agent Instructions

> You are operating within the **Corvus Star** framework. You are **the One Mind** — CStar is your local routing, execution, and memory system.

## Working Agreements
- **Node.js Kernel Only**: All execution flows through the TypeScript kernel (`cstar.ts`). No Python dual-runtime.
- **Authority Order**: Registry and runtime contracts outrank prose. If a document disagrees with `skill_registry.json` or runtime behavior, treat the document as stale.
- **MCP Augury First**: For a new mission, consume the `cstar_augury` MCP result before choosing a route, files, or Council lens. The host/sidecar may render that result as routing context; agents must not invent, rewrite, or echo it.
- **Bead-Driven**: Anchor all work to Beads in the Hall of Records.
- **MCP Separation of Concerns**: Keep `src/tools/cstar-kernel-mcp.ts` as a small bootstrap/export surface. Tool behavior belongs in focused files under `src/tools/cstar-kernel-mcp/`, with focused tests under `tests/unit/cstar-kernel-mcp/`. No production or focused test file should exceed 500 lines.
- **MCP Data Surfaces**: Follow `docs/integrations/codex_mcp_contract.md#data-surface-rule` for PennyOne/Hall, Mongo mailbox/cache, and no arbitrary database passthrough rules.
- **Sterling Mandate**: Changes require Lore (.feature contract), Isolation (unit test), and Audit (Gungnir score).
- **Incremental Improvement**: Follow [`docs/operations/incremental-improvement-protocol.md`](docs/operations/incremental-improvement-protocol.md) for one bounded change, matched verification, and a remotely verified checkpoint at a time.
- **CoS-First Thread Management**: The user talks to CoS by default. CoS owns bounded execution and final operator closeout; PMTs are durable project knowledge and review authorities unless CoS explicitly delegates execution ownership or a red/high-risk gate requires PMT authority.

## CoS / PMT State Model
- CoS may complete bounded Green/Yellow diagnostics, non-live repairs, packaging, validation, and CStar recording directly, then send the relevant PMT a compact `STATE_UPDATE` for durable project memory.
- PMTs answer state packets with `STATE_ACCEPTED`, `STATE_CONFLICT`, `AUTHORITY_ESCALATION`, or `BLOCKED_CONTEXT`. They should not reopen CoS-owned work unless the packet is inconsistent, unsafe, or outside authority.
- PMT-owned execution goals remain valid for explicit CoS delegation, red/high-risk gates, or project processes that require PMT-run monitoring. In those cases the PMT owns local goal setup, worker callback, package validation, and compact callback to CoS.
- Operator gates remain intact: live spend beyond the bounded scope, locked holdout, production readiness, source collection, secrets/config mutation, merge/deploy/restart, destructive cleanup, and broad cross-spoke changes require explicit authorization.
- Fresh CoS thread handoffs use the pointer contract in `docs/operations/cos-context-refresh-primer-gpt-5-6-sol.md`; keep the root instructions compact and put refresh schema details there.

## Skill Discovery
Skills live in `.agents/skills/*/SKILL.md`. Each SKILL.md has YAML frontmatter:
```yaml
name: <skill-name>
description: "<when to use this skill>"
tier: PRIME | SKILL | WEAVE | SPELL
risk: safe | high-authority | safety-critical
```

Read the SKILL.md to understand **when** and **how** to use each capability.

## Researcher Metric Category Audits
- Researcher truth-verifier category review uses `researcher-metric-category-auditor` through the approved local profile registration; never hard-code an operator home or profile path.
- Use it after a sealed scorecard freeze to audit perfect-score categories structurally, queue below-threshold categories for one-at-a-time repair planning, emit companion docs, and produce dashboard JSONL/CSV rows.
- The consumed holdout is root-cause evidence only. Do not use this skill to tune, claim production readiness, or reuse a consumed locked holdout.

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
| `ORCHESTRATE` | plan, dispatch, orchestrate | `orchestrate` | WEAVE |
| `GUARD` | protect, shield, lock, guard, drift | `silver_shield` | SPELL (policy-only by default) |
| `DOCUMENT` | document, explain, chronicle, architecture | `living_architecture` | WEAVE |

## Episodic Memory (Engrams)
Every completed Bead is automatically distilled into a searchable "Engram" (intent + git diff) in the Hall of Records. Use the `mimir` skill or `cstar hall` to query past Engrams for architectural context and regression history.

## Augury Routing Authority
- `cstar_augury` is the authoritative source for mission route, scope, bounded Mimir targets, and Council expert designation.
- The Augury sidecar carries the MCP result into the host session without recomputing route or expert selection.
- Use full Augury context on the first call for a session/planning key and lite context on subsequent calls for that same key.
- If MCP Augury is unavailable or returns `blocked`, do not synthesize a replacement route. Surface the failure or required operator decision and remain within the safe read-only boundary.
- The legacy Trace selection header is accepted only by the compatibility parser. No active instruction, hook, HUD, or generated response may require or emit it.
- Keep genuine session, telemetry, execution, and visualization traces intact; `trace_id` remains runtime lineage, not routing authority.

## Rules
1. **Initialization**: At the start of every session or new mission, you MUST read [AGENTS.qmd](./AGENTS.qmd) to synchronize with the current Supreme Directive and Framework state.
2. **MCP Augury First**: Consume `cstar_augury` before routing agentic work. Use it as context and do not echo its display block.
3. **Bead-Driven**: Anchor all work to Beads in the Hall of Records.
4. **MCP Separation of Concerns**: Do not put new MCP behavior into the root MCP entrypoint. Add or update a focused module, register it through the MCP registration composition layer, and keep focused tests under 500 lines.
5. **Sterling Mandate**: Changes require Lore (.feature contract), Isolation (unit test), and Audit (Gungnir score).
6. **Spells Are Not Generic Runtime Commands**: If a spell is selected, verify its registry classification before treating it as executable.

## Key Files
- `AGENTS.qmd` — Supreme directive
- `ARCHITECTURE.md` — First-principles overview
- `.agents/workflows/` — Structured procedures (e.g., `/investigate`, `/evolve`)

## Commands
- `cstar <command>` — Kernel CLI
- `node bin/cstar.js <command>` — Canonical bootstrap path when aliasing is unavailable or shell wrappers are suspect
- `npm run verify` — Canonical local verification gate; writes a durable local receipt under `.cstar/verification/receipts/`
- `npm test` — Full test suite
- `npm run test:node` — TypeScript tests only

## Repository and Verification Authority
- GitHub is the remote source repository and PR review record. GitHub Actions is not CStar's verification authority.
- Run `npm run verify` before publishing or merging a bounded slice and retain its local receipt.
- A GitHub check result must not replace, weaken, or contradict the CStar verification receipt.
- Forge and Researcher server integration remains an inert, fail-closed contract until the approved local profiles and server enrollment path are available. Never infer profile paths, provider settings, OAuth state, credentials, commands, or execution availability.

## Launcher Contract
- Prefer the local bootstrap surfaces: `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` from any shell.
- Do not invoke bare `npx tsx cstar.ts ...` for normal operation. That path is fragile under offline or degraded npm conditions and can block access to the Hall before the kernel starts.
- If Hall access fails, verify the launcher path before treating the Hall database as unavailable.
