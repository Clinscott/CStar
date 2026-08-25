# Project-controllers subsystem contract

- Scope: `systems/motor-action/subsystems/project-controllers`; parent: `systems/motor-action`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: declared project-scope read, handoff, and SET-bound dispatch.
- Each cross-spoke project has its own Bead, SET, controller, work cell,
  evidence, and result. This declaration grants no cross-spoke authority.
- No local declaration writes reducer/journal/Hall, accepts lifecycle, invokes
  providers, opens protected gates, or launches cognition.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
