# Reducer-journal subsystem contract

- Scope: `systems/control-plane/subsystems/reducer-journal`; parent: `systems/control-plane`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: scoped read, send, wait, and handoff. CStar alone appends
  the canonical journal and runs the canonical reducer.
- This local contract grants no authority or lifecycle acceptance.
- No local declaration grants direct reducer/journal write, lifecycle
  acceptance, provider, protected effects, or automatic cognition.
- Health checks use replay and hash-chain evidence; stale generations fail closed.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
