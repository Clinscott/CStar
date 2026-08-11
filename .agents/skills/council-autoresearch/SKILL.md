---
name: council-autoresearch
description: Run a bounded, evidence-frozen 19-lens Council evaluation with exactly one generation, durable publication, and an operator pause.
---

# Council Autoresearch

This is an unregistered reference skill. Discovery and generated host
distributions must not export it until an independent promotion review passes.

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
- Token-Path is always quarantined, non-actionable, non-steering, and
  write-disabled. Any different state fails closed.

## Required inputs

- one bounded run ID and exactly one declared generation;
- a clean committed source repository and explicit governed paths;
- one external `CSTAR_CONTROL_ROOT` for private immutable receipts;
- one caller-generated resume token retained outside receipts and reused for
  every lease-bound command;
- exactly 19 unique Council protocol digests;
- one preregistered Ed25519 host execution authority and exactly 19 uniquely
  signed execution receipts;
- recursively complete manifests for anonymous variants A and B, evidence,
  rubric, Council protocols, and the published runner checkpoint;
- the clean checkout actually executing this CLI, at the same full HEAD and
  canonical runtime path-to-digest map as that remotely verified checkpoint;
- a preregistered seed, derived Council order, A/B mapping commitment (never
  its plaintext reveal), rating
  axes, protected axes, tie policy, non-tie quorum, and nominal boundaries;
- an explicit publication repository, branch, required path set, and exact
  packet/ratings/mapping-reveal/decision path-role map.

## Lifecycle

1. Acquire the repository-wide source lease before cleanliness checks or reads.
2. Freeze and seal `10-packet.json`; this is the sole packet identity and
   preregistration for every later receipt.
3. Collect one complete 19-lens Council record. Synthesize at most three
   accepted change groups. Validate accepted changes before continuing.
4. Freeze and seal `20-ratings.json` only after all signed host execution receipts and
   rating artifacts verify. It contains no mapping reveal.
5. Only then write and seal `25-mapping-reveal.json` and verify its preregistered
   commitment.
6. Write and seal `30-decision.json` exactly once. Every verdict is advisory;
   `promotion_authorized` is always false and any promotion needs an independent
   authority receipt.
7. Separately obtain Git publication authority, publish the exact packet,
   ratings, and decision, then verify the remote ref and required file hashes.
8. Write and seal `40-publication.json`. Only fresh remote verification derives
   `PAUSED`. Report and
   stop. There is no generation-two command or receipt path.

## Fail-closed rules

- A failed lease contender never removes a lock it did not acquire.
- Source HEAD, cleanliness, and the recursive source manifest must match before
  and after each durable operation.
- A receipt body advances no phase until its source-bound seal is durable;
  dead-operation recovery re-attests source before discarding the guard.
- The executing runner checkout must remain clean at the exact published HEAD;
  post-packet resume uses its durable checkpoint locally and needs no network.
- Symlinks, special files, hard-link surprises, path escapes, case collisions,
  nested unclassified files, missing evidence, and any digest mutation fail.
- Ratings must match their Council protocol, signed host invocation, bound
  input channels, output artifact, and sole packet digest. Preference
  and protected-axis flags cannot contradict declared scores.
- Ties contribute zero and do not count toward the effective quorum. Nominal
  alpha/beta values are heuristic boundaries, not empirical error guarantees.
- Immutable receipt replay is idempotent only for byte-identical content. A
  conflicting replay stops without overwrite or cleanup.
- Publication binds each receipt role to one preregistered canonical path;
  digest membership or path-swapped content is insufficient.

## Terminal surface

Run through the repository wrapper so TypeScript resolution stays pinned:

```text
node scripts/run-tsx.mjs src/tools/council-autoresearch.ts <command> --request <request.json>
```

Supported commands are `lease-acquire`, `freeze-packet`, `freeze-ratings`,
`reveal-mapping`, `evaluate`, `verify-publication`, `status`,
`recover-operation`, and `lease-release`.

Each request uses the exact command envelope in the runbook. Generation-bearing
commands require the JSON number `1`; missing fields, extra fields, strings such
as `"1"`, and every other generation fail before effects. `lease-acquire`
requires the caller's resume token and never returns that raw token.
`recover-operation` is the explicit same-host dead-operation recovery path.
`lease-release` requires an explicit `completed` or `abandoned` disposition;
completed release additionally requires the bundle root and a `PAUSED` run.

Request shapes and receipt contract: `docs/operations/council-autoresearch.md`.
