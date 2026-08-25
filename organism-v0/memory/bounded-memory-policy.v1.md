# Bounded memory policy v1

Local memory is a content-addressed evidence cache. It is not lifecycle
authority, a controller, a reducer, a journal, a task launcher, or an
acceptance source.

- Keep only bounded summaries, hashes, decisions, gaps, and receipt references.
- Keep high-volume evidence outside Hall and outside local memory.
- Record an explicit `unavailable` value when a measurement is not exposed.
- Reject stale, malformed, contradictory, oversized, or unbound entries.
- Do not use memory to infer authority, model identity, ownership, or
  protected-effect permission.
- Preserve predecessor bytes and zero-credit attempts as immutable evidence.

The policy is bound to topology contract
`a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.
