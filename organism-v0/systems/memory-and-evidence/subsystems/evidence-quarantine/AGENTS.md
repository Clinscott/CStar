# Evidence-quarantine subsystem contract

- Scope: `systems/memory-and-evidence/subsystems/evidence-quarantine`; parent: `systems/memory-and-evidence`.
- Controller: `cstar` durable generation; role/profile: `subsystem-controller.v1`.
- Contract and parent hash: `a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
- Allowed effects: bounded read, quarantine reference, and handoff.
- Unknown, malformed, late, duplicate, or contradictory evidence remains
  quarantined with zero acceptance credit; it cannot grant authority.
- No local declaration writes Hall/SQLite or the canonical reducer/journal,
  accepts lifecycle, invokes providers, or launches cognition.
- No automatic cognition or automatic worker execution is permitted.
- Health and succession use CStar durable state; stale generations fail closed.
- Local schemas/tools/tests/runbooks/memory are subordinate. Forge = `TOMBSTONED_PERMANENT`.
