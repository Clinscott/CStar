# Senses-researcher subsystem contract

- Scope: `systems/nervous-system/subsystems/senses-researcher`; parent: `systems/nervous-system`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: scoped source evidence read, send, wait, and handoff.
- Researcher proposals are evidence only. They grant no authority, lifecycle
  state, provider outside an authorized lane, protected effect, or cognition.
- The canonical reducer and journal remain the accepted flat files.
- No automatic cognition or automatic worker execution is permitted.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
