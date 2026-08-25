# CStar Repository Instructions

CStar is the Corvus estate control plane. Apply the global Corvus invariants
first; this file adds only repository-specific rules and pointers.

## Authority and lifecycle

- Authority order is platform/operator safety, the current operator grant,
  global Corvus invariants, this repository's policies and runbooks, then the
  current CStar lifecycle state. Registries and observed runtime are evidence;
  neither can create or weaken authority.
- Use `cstar-kernel` MCP for health, handoff, routing, bead/proposal state,
  Forge/Researcher receipts, validation, and completion. Never bypass it with
  direct Hall/SQLite writes when the kernel surface exists.
- Beads are the durable work timeline. Model output, callbacks, artifacts,
  tests, and PRs remain evidence until the corresponding lifecycle transition
  is persisted.
- Preserve separate gates for live spend or sources, locked holdout,
  installation, restart, activation, merge, deployment, secrets/config,
  destructive cleanup, and production claims.

## Work routing

- CoS owns sequencing, bounded Green/Yellow work, evidence packaging, and
  closeout. PMTs are project-scoped information repositories only; read the
  mapped PMT for bounded context and send a compact `STATE_UPDATE` after
  meaningful work. PMTs do not grant execution, review, or routing authority.
- Corvus Forge implements through the durable
  `cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute ->
  private Hermes cstar-hub -> minimax/MiniMax-M3` path. Researcher gathers evidence through authorized
  lanes. Codex subagents may analyze or review; they do not replace Forge.
- When Forge's own boundary is broken, CoS may perform the smallest bootstrap
  repair allowed by the Forge runbook, with focused proof and CStar recording.
- Select Luna, Terra, or Sol only through a host surface that actually exposes
  and enforces the selector. Always record requested and actual identity
  separately; use `unreported` when the host does not report it.

## Goal and startup contract

For every non-trivial mission, bead run, resumed task, worker assignment, and
first task of a calendar day, follow
[`docs/operations/cstar-goal-driven-daily-bootstrap.md`](docs/operations/cstar-goal-driven-daily-bootstrap.md).
That runbook owns host-goal continuity, task-appropriate worker selection,
daily Codex/Hermes freshness, safe update windows, receipts, and restart gates.

## Repository engineering

- The TypeScript kernel is canonical. Keep
  `src/tools/cstar-kernel-mcp.ts` as a bootstrap/export surface; behavior lives
  in focused modules under `src/tools/cstar-kernel-mcp/`.
- No touched production or focused-test source file may exceed 500 lines.
- Reusable behavior is skill-first. Define inputs, outputs, logs, failure
  classes, receipts, and focused tests before promoting it to MCP.
- Changes require Lore (`.feature`), Isolation (focused tests), and an Audit
  backed by a real scorer or independent validation. Never invent a Gungnir or
  quality score; if no scorer ran, report test/evidence results directly.
- Historical docs, trace blocks, engrams, and metadata are leads, not current
  authority. Do not emit a ceremonial trace or score unless a current runbook
  explicitly requires it and the underlying evidence exists.
- Persona context comes only from the bounded persona field returned by
  `cstar_status`. Never read or print `.agents/config.json` or its containing
  objects.

## Canonical pointers

- Forge: `docs/operations/corvus-forge-pipeline-playbook.md` and
  `docs/operations/corvus-forge-skill-spec.md`
- Kernel MCP: `docs/integrations/cstar-kernel-mcp.md`
- Fresh CoS handoff: `docs/operations/cos-context-refresh-new-thread-packet.md`
- Goal/daily bootstrap: `docs/operations/cstar-goal-driven-daily-bootstrap.md`

## Validation commands

- `npm test` — full suite
- `npm run test:node` — TypeScript/Node suite
- `npm run test:python` — Python suite through the repository launcher
- `node scripts/run-python.mjs -m pytest <focused paths>` — focused Python
  checks with a WSL-native temporary root. The launcher requires the worktree's
  `.venv` or an explicit absolute `CSTAR_PYTHON_EXECUTABLE`; it never falls back
  silently to a system interpreter.
- `npm run typecheck` when present, otherwise `tsc --noEmit -p tsconfig.json`
- Focused tests must run in the repository/worktree that changed.

Prefer the local launcher (`./cstar` or `node bin/cstar.js`) when terminal use
is explicitly required. Do not substitute legacy shell `chant`/`evolve`,
AutoBot, or direct Hermes for a supported CStar lifecycle surface.
