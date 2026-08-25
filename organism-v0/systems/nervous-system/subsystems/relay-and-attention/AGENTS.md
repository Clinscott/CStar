# Relay-and-attention subsystem contract

- Scope: `systems/nervous-system/subsystems/relay-and-attention`; parent: `systems/nervous-system`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: scoped read, bounded relay evidence, send, wait, and handoff.
- Attention is a bounded projection. It cannot infer authority, create state,
  dispatch workers, write reducer/journal/Hall, or invoke protected effects.
- The canonical reducer and journal remain the accepted flat files.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
