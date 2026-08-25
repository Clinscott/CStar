# Action-control subsystem contract

- Scope: `systems/motor-action/subsystems/action-control`; parent: `systems/motor-action`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: read reserved effect evidence, send, wait, and handoff.
- Effect reservation is the only action authority. Local declarations cannot
  grant protected effects, call providers, write reducer/journal, or launch.
- Health and succession use CStar durable state; stale generations fail closed.
- One canonical reducer and one canonical journal remain the flat accepted files.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
