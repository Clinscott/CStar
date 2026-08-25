# Motor-action system contract

- Scope: `systems/motor-action`; parent: `organism-v0`.
- Controller: `cstar`; generation source: CStar durable state.
- Role and profile: `system-controller.v1`; contract hash:
  `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects are CStar-reserved, SET-bound reads and bounded work-cell
  evidence. Transport carries work and evidence, never root authority.
- This local contract grants no authority or lifecycle acceptance.
- No local declaration grants protected effects, provider, acceptance, direct
  reducer/journal write, unbounded descendants, or automatic worker execution.
- Native work cells are not Forge and cannot self-appoint or self-succeed.
- CStar keeps one reducer, one journal, and one controller per scope; stale
  generations fail closed and succession is atomic.
- Local contracts remain subordinate; CStar measures health and controls succession.
- Forge = `TOMBSTONED_PERMANENT`; S04 remains closed. Child policy adds limits.
