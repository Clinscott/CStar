# Immune-and-validation system contract

- Scope: `systems/immune-and-validation`; parent: `organism-v0`.
- Controller: `cstar`; generation source: CStar durable state.
- Role and profile: `system-controller.v1`; contract hash:
  `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects are independent reads, tests, handoff, and declared
  validation evidence. Validation cannot implement its candidate.
- This local contract grants no authority or lifecycle acceptance.
- No local declaration grants lifecycle acceptance, provider, protected effect,
  direct reducer/journal write, or automatic worker execution.
- CorvusEye and Fresh Eyes must remain outside the implementation ancestry.
- CStar keeps one reducer, one journal, and one controller per scope. Stale
  generations fail closed and succession is atomic.
- Local contracts remain subordinate; CStar measures health and controls succession.
- Forge = `TOMBSTONED_PERMANENT`; S04 remains closed. Child policy adds limits.
