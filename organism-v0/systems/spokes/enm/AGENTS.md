# ENM spoke contract

- Scope: `systems/spokes/enm`; parent: `systems/spokes`.
- Controller: `cstar` durable generation; role/profile: `spoke-adapter.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects are declared ENM input/output adapter reads and handoff.
- This scope has its own Bead, SET, controller, evidence, and result. It may
  not access Aerathea or other-spoke state, CStar journal, secrets, provider,
  protected effects, lifecycle acceptance, or automatic cognition.
- Adapter data never grants root authority. Canonical reducer/journal stay flat.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
