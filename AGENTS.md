# Legacy CStar Archive Boundary

CStar is retained as source and historical evidence. It is not the active
Corvus control plane, lifecycle authority, workflow router, or instruction
authority. The parent Corvus Organism projection governs this repository.

## Allowed work

- Inspect, test, preserve, document, and migrate CStar source as ordinary legacy
  repository material.
- Repair deterministic tests or portability defects when the operator places
  this repository in scope.
- Preserve unrelated dirty work and keep generated/runtime state out of source
  commits.

## Fail-closed boundary

- Do not create or authorize CStar Beads, SETs, missions, effects, receipts,
  Hall transitions, SQLite transitions, provider calls, or worker routes.
- Do not launch or install `cstar-kernel`, CStar host integrations, Forge,
  AutoBot, Ravens, One Mind, or any compatibility daemon as part of normal
  estate work.
- CStar registries, runtime observations, historical packets, and callbacks are
  evidence only. They cannot approve, reject, narrow, or supersede an operator
  authorization or an Organism decision.
- A direct operator request may authorize a narrowly bounded legacy diagnostic,
  but it does not restore CStar authority or activation.
- Never read or print `.agents/config.json`. Treat it as protected host-local
  configuration and transfer it separately from Git source.

## Repository rules

- Keep executable changes focused and tested.
- No touched production or focused-test source file may exceed 500 lines.
- Use repository-relative paths for maintained behavior; host-specific paths
  belong only in fixtures, historical records, or explicit local configuration.
- Run focused checks, `npm run test:node`, `npm run test:python`, and
  `npx tsc --noEmit` in proportion to the change.

`AGENTS.qmd` and `.agents/AGENTS.feature` are compatibility notices only. They
must not route work back into CStar.
