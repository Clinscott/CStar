# Memory-and-evidence system contract

- Scope: `systems/memory-and-evidence`; parent: `organism-v0`.
- Controller: `cstar`; generation source: CStar durable state.
- Role and profile: `system-controller.v1`; contract hash:
  `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects are bounded reads, evidence references, handoff, and
  SET-declared dispatch. High-volume evidence remains outside Hall.
- Local memory and projections never write Hall/SQLite and never grant
  authority, acceptance, provider access, protected effects, or cognition.
- The flat S00-S03 source remains the only reducer and journal implementation.
- No automatic cognition or automatic worker execution is permitted.
- Health and succession use CStar durable state; stale generations fail closed.
- Local contracts remain subordinate; CStar measures health and controls succession.
- Forge = `TOMBSTONED_PERMANENT`; S04 remains closed. Children add limits only.
