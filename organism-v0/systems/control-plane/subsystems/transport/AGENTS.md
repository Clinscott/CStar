# Transport subsystem contract

- Scope: `systems/control-plane/subsystems/transport`; parent: `systems/control-plane`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: scoped read, send, wait, handoff, and SET-declared delegation.
- This local contract grants no authority or lifecycle acceptance.
- Native task control is transport only. Every effect needs a typed ACK and
  one typed terminal packet; delivery is not acceptance.
- No local declaration grants lifecycle acceptance, provider, protected effects,
  reducer/journal writes, retry/replay/replacement, or automatic cognition.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
