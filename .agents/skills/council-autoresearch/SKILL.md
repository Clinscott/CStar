---
name: council-autoresearch
description: Run a bounded, evidence-frozen 19-lens Council evaluation with exactly one generation, separately authorized Git publication, and an operator pause. Use when an operator explicitly requests Council autoresearch, signed Council ratings, or an SPRT-style comparison.
---

# Council Autoresearch

This is a registered, host-owned, terminal-required `exec-bridge` skill.
Registration makes the bounded contract discoverable; it grants no kernel
fallback or source, Git, provider, Hall, deployment, or promotion authority.

Use this skill when an operator explicitly asks for a Council-led improvement
experiment, Council ratings, an SPRT-style comparison, or one bounded
autoresearch generation. It is an evaluation workflow, not source-mutation,
spend, Git, merge, deployment, or production authority.

## Authority boundary

- Council experts are advisory critique lenses. They cannot authorize work or
  convert synthetic judgments into empirical proof.
- Use Forge for source implementation when its lifecycle primitives are
  available. This skill never bypasses Forge, Hall, Git, spend, or deployment
  gates.
- The terminal runner is an `exec-bridge` owned by the host. It has no kernel
  fallback and writes no Hall or SQLite state.
- The validated receipt chain is the formal lifecycle only for this bounded
  evaluation run. The deterministic comparison is a pure evaluator over frozen
  inputs; its verdict is advisory and never becomes source, promotion, Git,
  provider, deployment, or production authority.
- Token-Path is always quarantined, non-actionable, non-steering, and
  write-disabled. Any different state fails closed.

## Support and trust prerequisite

- This registered runner supports POSIX runtimes with `O_NOFOLLOW` semantics only.
  Windows and filesystems that cannot provide the required no-follow,
  single-link, atomic-link, and Git-common-directory behavior fail closed.
- Before a run, an operator-controlled process outside this runner must
  preprovision
  `CSTAR_CONTROL_ROOT/council-autoresearch/trust-policy.json`. The private,
  single-link, non-group/world-writable policy pins the Ed25519 public execution
  authority, host receipt issuer, allowed input channels, Token-Path denial,
  canonical runner repository URL, and runner branch.
- The corresponding private signing key remains in the authorized host
  invocation bridge. The runner neither creates nor selects the signer, and a
  key embedded in a packet is not trusted unless it matches the preprovisioned
  policy.

## Required inputs

- one bounded run ID and exactly one declared generation;
- a clean committed source repository and explicit governed paths;
- one external `CSTAR_CONTROL_ROOT` for private immutable receipts;
- one externally provisioned execution trust policy and signer as described
  above;
- exactly 19 unique Council protocol digests;
- one preregistered Ed25519 host execution authority and exactly 19 uniquely
  signed execution receipts;
- recursively complete manifests for the verified evaluation contract,
  anonymous variants A and B, evidence, rubric, Council protocols, and the
  published runner checkpoint;
- a runner checkpoint whose canonical repository URL and branch match the
  trust policy and whose exact canonical path-to-digest map matches the local
  runner manifest;
- a preregistered seed, derived Council order, A/B mapping commitment (never
  its plaintext reveal), rating axes, protected axes, tie policy, non-tie
  quorum, and nominal boundaries;
- an explicit result-publication repository, branch, required path set, and
  semantic `packet`, `ratings`, `reveal`, and `decision` receipt paths.

## Lifecycle

1. Verify the external trust policy and the already-published runner checkpoint.
2. Acquire the repository-wide source lease before cleanliness checks or reads.
   Treat the returned resume token as a secret capability: capture it privately,
   never commit it, and do not paste it into logs or reports.
3. Freeze `10-packet.json`; this is the sole packet identity and
   preregistration for every later receipt.
4. Collect one complete 19-lens Council record. Synthesize at most three
   accepted change groups. Validate accepted changes before continuing.
5. Freeze `20-ratings.json` only after all signed host execution receipts and
   rating artifacts verify. It contains no mapping reveal.
6. Only then write `25-mapping-reveal.json` and verify its preregistered
   commitment.
7. Write `30-decision.json` exactly once. Every verdict is advisory;
   `promotion_authorized` is always false and any promotion needs an independent
   authority receipt.
8. Separately obtain Git publication authority, publish the exact packet,
   ratings, reveal, and decision, then verify the remote ref and required file
   hashes.
9. Write `40-publication.json`. Only fresh remote verification derives
   `PAUSED`. Report and stop. There is no generation-two command or receipt
   path.

## Fail-closed rules

- A failed lease contender never removes a lock it did not acquire.
- A per-command operation guard binds the active lease and resume-token digest.
  Ordinary commands never remove an existing guard. Explicit recovery requires
  exact lease binding plus stable machine, boot, PID-namespace, procfs PID, and
  process-start evidence that the original owner is definitely dead; mismatched,
  ambiguous, live, or interrupted recovery ownership remains fail-closed.
- Source HEAD, cleanliness, and the recursive source manifest must match before
  and after each durable operation.
- The verified contract manifest, runner checkpoint, canonical runner
  path-to-digest map, pinned canonical remote URL, and preprovisioned trust
  policy must remain unchanged.
- Symlinks, special files, hard-link surprises, path escapes, case collisions,
  nested unclassified files, missing evidence, and any digest mutation fail.
- Ratings must match their Council protocol, signed host invocation, bound
  input channels, output artifact, and sole packet digest. Preference
  and protected-axis flags cannot contradict declared scores.
- Result publication must map each semantic receipt role (`packet`, `ratings`,
  `reveal`, and `decision`) to one unique preregistered path and must publish
  the exact corresponding receipt digest at that path.
- Ties contribute zero and do not count toward the effective quorum. Nominal
  alpha/beta values are heuristic boundaries, not empirical error guarantees.
- Immutable receipt replay is idempotent only for byte-identical content. A
  conflicting replay stops without overwrite or cleanup.
- A conflicting packet replay is rejected before creating any experiment claim,
  so a failed replay cannot reserve an unrelated experiment identity.

## Terminal surface

Run through the repository wrapper so TypeScript resolution stays pinned:

```text
node scripts/run-tsx.mjs src/tools/council-autoresearch.ts <command> --request <request.json>
```

Supported commands are `lease-acquire`, `freeze-packet`, `freeze-ratings`,
`reveal-mapping`, `evaluate`, `verify-runner-checkpoint`,
`verify-publication`, `status`, and `lease-release`.

`verify-runner-checkpoint`, `verify-publication`, and a fully validating
`status` may read a configured Git remote. That is a separately authorized,
read-only Git/network boundary: the request names a configured remote, while
the runner canonicalizes and pins its URL, verifies the exact ref and files,
and never fetches, pushes, or rewrites Git state. `lease-acquire` returns the
raw resume token on stdout; handle that output as sensitive material.

Full contract and receipt examples: `docs/operations/council-autoresearch.md`.
