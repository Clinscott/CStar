# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Estate-level guidance lives in `~/Corvus/CLAUDE.md`. This file carries CStar-local operational details.

## The Kernel Is the MCP

CStar has transitioned from a Commander-based CLI to a host-attached MCP server. The authoritative kernel surface is now the `cstar-kernel` MCP, defined in `src/tools/cstar-kernel-mcp.ts` and launched via `bin/cstar-kernel-mcp.js`. The `.mcp.json` at the repo root registers it.

- **`cstar.ts` is the legacy kernel.** It still works as a launcher and as a host for a few terminal-bound commands (`start`, `tui`, `ravens`, `bifrost`, OS install), but its CLI-exposed capabilities are being absorbed into MCP tools. Treat any new useful capability as belonging on the MCP unless it is intrinsically terminal-bound.
- **Authority order**: registry + runtime contracts (`.agents/skill_registry.json`, `src/node/core/runtime/`, `src/tools/cstar-kernel-mcp.ts`) outrank prose. If `AGENTS.qmd`, `README.qmd`, `ARCHITECTURE.md`, or this file disagree with the MCP tool list or the runtime, follow the code.
- **Prose drift to watch for**: docs still claim "the six-tool kernel" — that count is stale (current MCP exposes 20). Docs also describe a richer `.agents/skills/` ecosystem than exists on disk (only 3 `SKILL.md` files repo-wide). Verify before relying on a referenced path.

Read `AGENTS.qmd` at session start to sync with the Supreme Directive.

## Current cstar-kernel MCP Tools

Source of truth: `src/tools/cstar-kernel-mcp.ts` (search for `server.tool(`).

| Tool | Purpose |
|:---|:---|
| `cstar_handoff` | Compact active state from Augury/handoff logic. |
| `cstar_hall_search` | Bounded FTS5 search across CODE / DOC / ENGRAM / BEAD / SESSION / LESSON. |
| `cstar_hall_maintenance` | `study` / `harvest` engram lessons. |
| `cstar_augury` | Augury route resolution. |
| `cstar_doctor` | Kernel diagnostics. |
| `cstar_verify_plan` | Plan verification gate. |
| `cstar_bead` | Bead lifecycle ops. |
| `cstar_spoke_bead_import` | Pull a bead from a registered spoke into the hub Hall. |
| `cstar_record_result` | Record a bead result / promote to Engram. |
| `cstar_engram_record` | Record an episodic memory entry. |
| `cstar_war_game_score` | Score / register / tally war-game contests. |
| `cstar_manifest` | Capability discovery — kernel registry merged with spoke-local manifests (announce-only per BEAD-CSTAR-SPOKE-DISCOVERY-001). |
| `cstar_skill_info` | Per-capability contract: `<slug>:<id>` for spoke, bare id for hub. |
| `cstar_spoke_journal` | Four-file journal state for a registered spoke (memory / tasks / wireframe / DEV_JOURNAL). |
| `cstar_status` | Deterministic framework snapshot from `StateRegistry`: status, persona, gungnir score, managed spokes, agent presence. |
| `cstar_evolve` | Read-only inspection of Karpathy-loop artifacts: `list_proposals`, `get_proposal`, `list_sprt_history`. Proposal generation and adversarial critique stay host-native. |
| `cstar_spoke` | Mounted-spoke lifecycle: `list` / `link` / `unlink` / `inspect`. Completes the spoke surface alongside `cstar_spoke_journal` and `cstar_spoke_bead_import`. |
| `cstar_intent_route` | Resolve a prompt against the kernel intent grammar (`.agents/skill_registry.json#intent_grammar`). `action=match` returns the first hit; `action=explain` enumerates every matching category. Response includes `grammar_source` (`registry` if the registry loaded, `fallback` for the in-code defaults). |
| `cstar_warden` | On-demand Sentinel Warden invocation. `list` shells out to `scripts/run_warden.py --list-wardens` (driver is the source of truth), `bounties` returns the cached `tech_debt_ledger.json`, `scan` invokes a named Python warden. Structured `dependency_missing` envelope when a transitive Python dep is unavailable. |
| `cstar_telemetry` | Read-only MCP telemetry summaries over the last 24h. `section=usage` returns raw call counts, `section=usefulness` returns outcome-derived rates (search hit, bead transitions, validation, augury routing), `section=token_path` returns the token-path advisor integration summary, `section=all` (default) returns every block. Sourced from `.agents/state/cstar-kernel-mcp-*.jsonl`. |

## Legacy CLI → MCP Mapping

When a legacy `./cstar <command>` invocation has an MCP equivalent, **prefer the MCP tool**. The CLI remains as a thin host for terminal-bound concerns.

| Legacy CLI | MCP equivalent | Notes |
|:---|:---|:---|
| `cstar hall <query>` | `cstar_hall_search` | + `cstar_hall_maintenance` for study/harvest. |
| `cstar manifest` | `cstar_manifest` | Hub + spoke namespacing. |
| `cstar skill-info <id>` | `cstar_skill_info` | |
| `cstar augury` | `cstar_augury` | |
| `cstar war-game …` | `cstar_war_game_score` | tally, recent, by-scenario, get, list-contests. |
| `cstar spoke journal <slug>` | `cstar_spoke_journal` | |
| `cstar spoke link/unlink/list` | `cstar_spoke` | action=link/unlink/list/inspect. |
| `cstar status` | `cstar_status` | Deterministic snapshot; no HUD/chalk formatting. |
| `cstar evolve` (read paths) | `cstar_evolve` | Deterministic read of proposals + SPRT ledger. Proposal/critique generation still goes through `weave:evolve` host-native. |
| `cstar trace` | `cstar_handoff` (partial) | Trace surface still partly CLI-resident. |

Terminal-bound CLI commands that stay where they are (do not promote to MCP unless a host-native path makes sense): `start`, `tui`, `ravens`, `bifrost`, `os install/uninstall`.

### Candidates for MCP promotion (if deemed useful)

`cstar.ts` still hosts these capabilities without an MCP equivalent. If a session needs them, evaluate whether they belong on the MCP and add them to `src/tools/cstar-kernel-mcp.ts` rather than shelling out:

- `orchestrate` — bead dispatch loop (overlaps with `cstar_bead` + `cstar_record_result`; verify before duplicating).
- `evolve` (write paths) — mutation `propose` and `promote` are LLM-driven via `weave:evolve` / `weave:critique`; keep host-native per the mandate.
- `one-mind` — Hall-backed broker requests.
- `broadcast` / `hand` — inter-agent messaging.

Rule of thumb: if a function is useful from a non-terminal host (Claude, Gemini, Codex) and is not intrinsically interactive, it belongs on the MCP. Do not add a shell shim where an MCP tool would do.

### Explicitly NOT promoted

- `run-skill` — generic skill execution from MCP would violate the Host-Native Skill Mandate (skills are harness-executed). Per-skill MCP tools are a separate effort.
- `oracle` — host-agent sampling. The host IS the oracle; wrapping it in MCP creates a recursive loop.
- Terminal-bound: `start`, `tui`, `ravens`, `bifrost`, `os install/uninstall` stay on the CLI.

## Host-Native Skill Mandate

Skills are harness skills, not shell commands.

- Do not run CStar skills through terminal dispatch (`cstar run-skill`, dynamic command fallback, shell wrappers, or script shims) unless the skill is explicitly marked terminal-required.
- `entry_surface: "cli"` is not terminal permission. Terminal execution requires `terminal_required: true`, `execution.requires_terminal: true`, or `execution.terminal_contract: "required"`.
- Use the host-native skill bridge/harness for agent-native and host-only skills. `chant` is a host-native skill/planning surface, not a shell workflow.
- Do not add shell scripts as skill entrypoints unless a terminal is intrinsically required. Prefer `SKILL.md` instructions, host workflow adapters, and harness-native activation.
- Verification should be bounded and harness-native. Broad scans or live terminal smoke tests require explicit user approval for the exact command.
- Canonical bridge contract: `docs/host-native-skill-bridge.md`.

## Launcher Contract (legacy CLI)

When the CLI is genuinely needed (terminal-bound commands, dev scripts):

- Use `./cstar <command>` from repo root, or `node bin/cstar.js <command>`.
- Do NOT invoke bare `npx tsx cstar.ts ...`. That path is fragile under offline/degraded npm conditions and can block Hall access before the kernel starts.
- `./cstar` is a thin bash wrapper that resolves `bin/cstar.js`; treat `bin/cstar.js` as the canonical bootstrap entry.

## Commands

### Testing
```bash
npm test                 # Full suite: Node TS tests + Python (pytest)
npm run test:node        # TypeScript tests only (Node --test via tsx)
npm run test:python      # pytest across tests/unit, tests/integration, tests/empire_tests, tests/crucible
npm run test:empire      # Empire contract tests (Gherkin .feature specs in tests/empire_tests/)
npm run test:ipc         # IPC integration tests (tests/integration/ipc/)
```

Run a single TypeScript test:
```bash
node scripts/run-tsx.mjs --test tests/path/to/file.test.ts
```

Run a single Python test:
```bash
node scripts/run-python.mjs -m pytest tests/unit/path/to/test_file.py::test_name
```

The `scripts/run-tsx.mjs` and `scripts/run-python.mjs` wrappers handle environment setup — prefer them over invoking `tsx` or `pytest` directly.

### Lint
```bash
npx eslint .
```
ESLint uses `@eslint/js` recommended + `typescript-eslint` strict + `eslint-plugin-jsdoc` (flat/recommended). Ignores `.stats/`, `.agents/`, `node_modules/`.

### Distribution / release
```bash
npm run build:distributions       # Regenerate registry-backed distribution manifests
npm run validate:distributions    # Check for drift
npm run release:prepare           # Manifests + validate + bundle + archive into dist/releases/
npm run install:hosts-local       # Install Gemini + Codex local bundles
```

## Code Conventions

- TypeScript: `target: ESNext`, `module: NodeNext`, `strict: true`. ESM throughout (`"type": "module"` in `package.json`).
- Style: 4-space indent, single quotes, mandatory semicolons (enforced by ESLint).
- JSDoc: `require-param-description` and `require-returns-description` are errors. `reject-function-type` is off.
- NodeNext requires explicit `.ts`/`.js` import suffixes; `allowImportingTsExtensions: true` is set.
- Tests: Node's built-in `node --test` (run via `tsx`) for TS; `pytest` for Python. Empire tests pair Gherkin `.feature` specs with TS/Python step files.

## Key Entry Points

- `src/tools/cstar-kernel-mcp.ts` — **The current kernel.** All MCP tool definitions live here. New useful capability lands here, not in `cstar.ts`.
- `bin/cstar-kernel-mcp.js` — MCP launcher (re-execs Node with the `tsx` loader against the TS entry).
- `.mcp.json` — Server registration so MCP-capable hosts auto-discover `cstar-kernel`.
- `cstar.ts` — Legacy Commander CLI. Still owns terminal-bound commands. Do not extend with new non-terminal capabilities.
- `bin/cstar.js` — Canonical CLI bootstrap; `./cstar` shell wrapper execs into this.
- `src/node/core/runtime/bootstrap.ts` — Runtime bootstrapper used by both surfaces.
- `src/node/core/runtime/dispatcher.ts` — `RuntimeDispatcher` singleton (57KB; authoritative dispatch contract for skills/beads).
- `src/node/core/runtime/adapters.ts` — Skill execution adapters.
- `src/node/core/CognitiveRouter.ts` — Intent → capability routing.
- `src/node/gateway/server.ts` — Fastify gateway.
- `.agents/skill_registry.json` — Authoritative capability registry (intent grammar + entries). Sparser than prose docs imply; runtime resolves from this file first.

## Sterling Mandate (verification triad)

No change is final until it satisfies:
1. **Lore** — `.feature` contract describes the behavior (Gherkin, `tests/empire_tests/`).
2. **Isolation** — 1:1 unit test (Node `--test` or pytest) confirms logic in a sandbox.
3. **Audit** — Gungnir score (`[L] [S] [I] [G] [V] [E] [A] [Ω]`) holds or improves.

Sentinel Wardens (`src/core/engine/wardens/`, Python) scan completed Beads for Linscott Breaches (missing tests), dead code (Valkyrie), Gungnir regressions (Freya/Mimir), and type-boundary violations (Ghost). A Warden rejection fails the Bead.
