# CorvusEye subsystem contract

- Scope: `systems/immune-and-validation/subsystems/corvus-eye`; parent: `systems/immune-and-validation`.
- Controller: `cstar` durable generation; role/profile: `validator.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: independent candidate read, tests, result packet, and handoff.
- CorvusEye MUST be independent of implementation ancestry. Its result is
  evidence until CStar records the independent result.
- It cannot edit candidates, grant authority, invoke providers, or launch
  cognition; the canonical reducer and journal remain flat.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
