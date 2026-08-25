# Nervous-system contract

- Scope: `systems/nervous-system`; parent: `organism-v0`.
- Controller: `cstar`; generation source: CStar durable state.
- Role and profile: `system-controller.v1`; contract hash:
  `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects are declared reads, handoff, and SET-bound system dispatch.
- This declaration grants no authority, provider, protected effect, acceptance,
  direct reducer/journal write, or automatic worker execution.
- Researcher is a future bounded source adapter. It cannot create lifecycle
  state or automatic cognition here.
- CStar owns the one reducer, one journal, one controller per scope, health,
  and succession. Stale generations fail closed.
- Local contracts remain subordinate; CStar measures health and controls succession.
- Forge = `TOMBSTONED_PERMANENT`; S04 remains closed. Child policy can add
  restrictions only.
