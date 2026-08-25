# Intent subsystem contract

- Scope: `systems/control-plane/subsystems/intent`; parent: `systems/control-plane`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: scoped read, send, wait, handoff, and SET-declared delegation.
- Intent normalization does not grant authority, lifecycle acceptance, provider,
  protected effects, reducer/journal writes, or automatic cognition.
- The canonical reducer and journal remain the accepted flat S00-S03 files.
- Health and succession are measured by CStar; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
