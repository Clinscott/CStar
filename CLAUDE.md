# Claude Guidance for CStar

> **Legacy-only boundary:** Do not route through, install, activate, or mutate
> lifecycle state with CStar. Corvus Organism is authoritative. The remaining
> CStar material may be inspected, tested, preserved, or migrated as ordinary
> legacy source under `AGENTS.md`.

Read `/home/morderith/.codex/AGENTS.md`,
`/home/morderith/Corvus/AGENTS.md`, and this repository's `AGENTS.md` before
structural work. Detailed Claude host guidance is in
`docs/integrations/CLAUDE.qmd`.

## Authority and State

CStar is an inactive historical control-plane implementation. Its registries,
schemas, runtime observations, and artifacts are evidence only.

Do not use `cstar-kernel`, the legacy CLI, Hall, or SQLite for current estate
workflow or lifecycle changes.

## Runtime Boundary

The typed public-tool catalog is
`src/tools/cstar-kernel-mcp/contracts/tool_catalog.ts`; explicit schemas and
handlers are registered in
`src/tools/cstar-kernel-mcp/register_core_tools.ts`.
`src/tools/cstar-kernel-mcp.ts` remains a thin composition entrypoint.

Codex uses the host-global wrapper and direct source stdio launcher. The Codex
plugin is skill-only. `bin/cstar-kernel-mcp-bridge.js` is compatibility-only;
TCP mode and `scripts/cstar-mcp-tcp-daemon.js` are retired and fail closed.

Use the legacy CLI only for a documented terminal-required capability or when
MCP lacks the bounded primitive:

```bash
./cstar <command>
node bin/cstar.js <command>
```

Do not use shell `chant`/`evolve`, generic `run-skill`, or a raw shell/model call
as an implementation bypass.

## Estate Routing

- CoS owns estate sequencing, bounded Green/Yellow execution, evidence
  packaging, lifecycle updates, and closeout.
- Forge builds through the durable CStar request/execute path.
- Researcher gathers evidence through authorized source lanes.
- CorvusEye independently evaluates when required.
- PMTs are project-scoped information repositories only. Query the mapped PMT
  for bounded context when working in its project folder, then send a compact
  update after meaningful work. PMTs grant no authority.
- MM is legacy and has no active routing role.
- Host subagents may analyze or review; they do not replace Forge.

When querying a mapped PMT thread, use an enforceable current GPT-5.6 selector:
Luna for routine retrieval, Terra for conflicting-context synthesis, and Sol
for high-stakes architecture/security/incident forensics. Record requested and
actual identity; do not pretend selection where the host provides none.

## Forge

Live implementation uses only:

`cstar_forge_request -> cstar_forge_execute -> private Hermes cstar-hub /
minimax MiniMax-M3 -> delivered_unverified -> independent cstar_record_result`

Request is no-spend. Execute requires a durable exact request, request-bound
one-shot operator attestation, output/package locks, sealed adapter runtime, and
atomic attempt reservation. Delivery is not success. Validation/finalization
is independent and transactional.

Public AutoBot and direct Hermes routes are decommissioned.

## Augury, Council, TokenPath, Persona

- Augury is non-actionable deterministic routing advice; use it only for a new
  or ambiguous route/material scope.
- Council experts are immutable critique lenses, not votes, risk, confidence,
  ownership, or proof.
- TokenPath is quarantined and performs no steering or observation writes.
- Persona affects professional tone/domain emphasis only, never authority.

## Commands

```bash
npm run test:node
npm run test:python
npx tsc --noEmit
npm run build:distributions
npm run validate:distributions
```

Run one TypeScript test with
`node scripts/run-tsx.mjs --test <test-file>` and one Python test with
`node scripts/run-python.mjs -m pytest <test-selector>`.

Host staging commands (`install:gemini-local`, `install:codex-local`) are
separately operator-gated. Staging, cache reconciliation, host restart, and live
activation proof are distinct operations.

## Code Conventions

- TypeScript is strict ESM/NodeNext with explicit import suffixes.
- Use four-space indentation, single quotes, and semicolons.
- Keep `src/tools/cstar-kernel-mcp.ts` thin and put behavior/tests in focused
  modules.
- Production and focused kernel files remain below the enforced 500-line limit.
- Preserve unrelated dirty-root changes and exact-file packaging.

## Key References

- `AGENTS.md` / `AGENTS.qmd`
- `docs/integrations/codex_mcp_contract.md`
- `docs/integrations/cstar-kernel-mcp.md`
- `docs/operations/corvus-forge-pipeline-playbook.md`
- `docs/operations/corvus-forge-skill-spec.md`
- `docs/architecture/cos-pmt-thread-architecture.md`
- `docs/architecture/COUNCIL_EXECUTION_SYSTEM.md`

## Verification

Run focused tests in the repository that changed, then broader suites in
proportion to risk. Current source, live runtime, CStar lifecycle state, and
independent evidence must agree before completion.

Do not invent Gungnir, confidence, or quality scores. Numeric claims require a
real scorer, nonzero denominator, formula, exclusions, class coverage, row
evidence, and an independent probe. Keep development proof separate from
production and locked-holdout readiness.

No merge, push, deploy, restart, secret/configuration mutation, destructive
cleanup, source/spend expansion, or production claim without its explicit
operator gate.
