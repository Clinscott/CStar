# Native-work-cells subsystem contract

- Scope: `systems/motor-action/subsystems/native-work-cells`; parent: `systems/motor-action`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: packet-bound work-cell read, bounded task evidence, and handoff.
- A work cell cannot infer authority, self-appoint, self-succeed, mutate the
  reducer/journal, accept lifecycle, invoke providers, or create descendants.
- Health and succession use CStar durable state; stale generations fail closed.
- One canonical reducer and journal remain the flat accepted files; Forge is
  `TOMBSTONED_PERMANENT`, not a worker substrate.
- Local schemas/tools/tests/runbooks/memory are subordinate; S04 remains closed.
