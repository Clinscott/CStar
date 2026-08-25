# Security-gates subsystem contract

- Scope: `systems/immune-and-validation/subsystems/security-gates`; parent: `systems/immune-and-validation`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: read protected-gate state, tests, evidence, and handoff.
- A gate observation cannot open a gate or grant provider, configuration,
  activation, deployment, production, migration, or lifecycle acceptance.
- No local declaration writes the reducer/journal, launches workers, or invokes
  providers. Health and succession use CStar durable state.
- Stale generations fail closed; child policy adds restrictions only.
- Forge = `TOMBSTONED_PERMANENT`; local schemas/tools/tests/runbooks/memory are subordinate.
