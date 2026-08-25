# Working-memory subsystem contract

- Scope: `systems/memory-and-evidence/subsystems/working-memory`; parent: `systems/memory-and-evidence`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: bounded local read, content-addressed summary, and handoff.
- Memory is not authority, a reducer, a journal, a task launcher, or an
  acceptance source. Oversized, stale, or unbound entries fail closed.
- No automatic cognition or automatic worker execution is permitted.
- The canonical reducer and journal remain the accepted flat files.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
