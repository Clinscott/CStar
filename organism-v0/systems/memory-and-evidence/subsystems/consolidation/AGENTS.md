# Consolidation subsystem contract

- Scope: `systems/memory-and-evidence/subsystems/consolidation`; parent: `systems/memory-and-evidence`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: bounded read, immutable summary reference, and handoff.
- This local contract grants no authority or lifecycle acceptance.
- Consolidation cannot mutate the canonical journal/reducer, write Hall/SQLite,
  grant authority, accept lifecycle, invoke providers, or launch cognition.
- No automatic cognition or automatic worker execution is permitted.
- Hash-bound predecessors and zero-credit attempts remain immutable evidence.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
