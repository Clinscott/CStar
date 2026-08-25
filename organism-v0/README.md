# Corvus Organism Kernel v0 — S00 foundation

This package is the isolated S00 foundation for the Corvus Organism Kernel v0.
It defines compact sorted-key UTF-8 canonical JSON with one final LF, SHA-256
helpers, self-hash omission, closed schema declarations, fail-closed
top-level validation, and deterministic canonical vectors.

## Boundary

S00 does not implement intent verification, identifier derivation, reducer
transitions, journal persistence, snapshots, effects, outbox/inbox state,
transport, project-controller dispatch, the manual lane, a CStar MCP adapter,
or a CLI. Those behaviors belong to later separately gated SETs. This package
does not grant authority from prose, transport metadata, callbacks, or
fixtures. It does not write Hall or SQLite and it does not register, install,
activate, restart, migrate, deploy, publish, or use a provider.

## Files

The S00 output is limited to the following six files:

1. `package.json`
2. `src/canonical.ts`
3. `src/schemas.ts`
4. `fixtures/intent_vectors.json`
5. `tests/canonical_hashes.test.ts`
6. `README.md`

The fixture includes an empty-journal canonical vector. Object keys are sorted
recursively; array order is fixed and preserved. A self-hash removes only its
own named field before hashing.

## Verification

Run the packet-bound canonical test from the isolated implementation root:

```text
node --import tsx --test organism-v0/tests/canonical_hashes.test.ts
```

This is foundation evidence only. Independent validation and CStar lifecycle
acceptance remain separate gates.
