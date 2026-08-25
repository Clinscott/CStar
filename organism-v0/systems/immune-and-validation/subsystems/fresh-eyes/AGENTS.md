# Fresh-eyes subsystem contract

- Scope: `systems/immune-and-validation/subsystems/fresh-eyes`; parent: `systems/immune-and-validation`.
- Controller: `cstar` durable generation; role/profile: `validator.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: independent candidate read, tests, result packet, and handoff.
- Fresh Eyes MUST remain outside implementation ancestry and cannot edit the
  candidate, mutate lifecycle state, grant acceptance, invoke providers, or
  launch cognition.
- The canonical reducer and journal remain the accepted flat files.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
