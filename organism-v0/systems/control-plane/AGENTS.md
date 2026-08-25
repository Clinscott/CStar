# Control-plane system contract

- Scope: `systems/control-plane`; parent: `organism-v0`.
- Controller: `cstar`; generation source: CStar durable state.
- Role: `system-controller.v1`; capability profile: `system-controller.v1`.
- Parent contract hash and local contract hash:
  `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects are declared system reads, handoff, and SET-bound dispatch.
- This declaration grants no parent authority, lifecycle acceptance, provider,
  protected effect, direct reducer/journal write, or automatic worker execution.
- `organism-v0/src/reducer.ts` is the only reducer and
  `organism-v0/src/journal.ts` is the only journal.
- Health signals, succession, and escalation use the root manifests. Stale
  generations fail closed and succession is an atomic CStar transition.
- Forge = `TOMBSTONED_PERMANENT`; S04 remains closed.
- Local schemas, tools, tests, runbooks, and bounded memory are subordinate
  contract roots and cannot weaken this contract.
