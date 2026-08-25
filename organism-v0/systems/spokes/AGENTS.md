# Spokes system contract

- Scope: `systems/spokes`; parent: `organism-v0`.
- Controller: `cstar`; generation source: CStar durable state.
- Role and profile: `system-controller.v1`; contract hash:
  `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects are declared spoke reads, handoff, and separate CStar
  effects. Each spoke has its own Bead, SET, controller, evidence, and result.
- A local declaration grants no other-spoke state, CStar journal write,
  authority, acceptance, secrets, provider, or automatic worker execution.
- Spokes remain outside CStar control-plane implementation. Adapters carry
  declared input/output only.
- CStar keeps one reducer, one journal, and one controller per scope; stale
  generations fail closed and succession is atomic.
- Forge = `TOMBSTONED_PERMANENT`; S04 remains closed. Child policy adds limits.
