# Council autoresearch runner

Council autoresearch is a host-owned, terminal-required evaluation workflow for
one evidence-frozen 19-lens Council comparison and exactly one generation. It
does not implement source changes, launch providers, mutate Hall, push Git, or
deploy. Those effects keep their existing Forge and operator gates.

The skill is intentionally unregistered in the first landing. It is not
exported through CStar discovery or generated host distributions until a
separate promotion review validates this runtime and its host signer contract.

## Durable receipt chain

Schema and runner version `2.2.0` write private, immutable receipt bodies beneath
`CSTAR_CONTROL_ROOT/council-autoresearch/<run-id>/`:

| Receipt | Meaning |
|---|---|
| `00-source-lease.json` | Exact repository, HEAD, governed paths, recursive source manifest, and hashed resume token |
| `10-packet.json` | Sole preregistration and packet identity |
| `20-ratings.json` | Complete frozen 19-lens ratings with 19 signed execution receipts; no mapping reveal |
| `25-mapping-reveal.json` | Post-ratings reveal bound to the preregistered mapping commitment |
| `30-decision.json` | Exactly-once generation-1 decision |
| `40-publication.json` | Verified remote ref, commit, and required file hashes; derives `PAUSED` |
| `50-source-release.json` | Explicit completed or abandoned lease disposition; derives `RELEASED` or `ABORTED` |

Receipts use no-clobber publication. Byte-identical replay is idempotent;
conflicting content fails without overwriting the earlier receipt. Phase is
derived only from a fully validated receipt-and-seal prefix. Every JSON body has
a deterministic sibling `<receipt>.seal.json` that binds its body digest to the
source lease, source HEAD, and source-manifest digest. A body without its seal is
phase-invisible and recoverable only after the source is re-attested; a seal
without its body fails closed. The publication receipt is
written only after live verification of the exact remote branch, commit, and
file hashes. Later status checks can replay that durable proof offline; when a
publication repository is supplied, status also revalidates current remote
state. A preplanted or merely self-consistent JSON file cannot invent
completion.

## Source lease

The exclusive anchor is keyed by the canonical repository root and stored under
the Git common directory. Acquisition happens before HEAD/status checks. Only a
holder with the matching run ID and resume token can verify or release it. A
contender that fails `O_EXCL` never enters cleanup. The runner rechecks HEAD,
cleanliness of every governed path, and the recursive manifest before and after
each durable receipt commit. Only the post-commit attestation permits the seal
to be written. A same-host dead-operation guard can be recovered explicitly;
if its body exists, source drift preserves both the unsealed body and guard
until the exact source is restored. A body-only terminal release is likewise
replayed and sealed before its owned lease anchor is removed.

The control root must be outside the source repository so receipt writes cannot
invalidate source cleanliness. Stale ownership has no automatic timeout;
recovery is an explicit operator action because a guessed dead owner is less
safe than a blocked run.

## Packet and manifests

The packet binds:

- the canonical 19 Council experts with one unique protocol path and digest each;
- recursive, no-follow artifact manifests for anonymous variants A/B,
  evidence, rubric, protocols, and the runner publication checkpoint;
- the committed source HEAD and source-manifest digest, governed paths,
  experiment identity, contract digest, seed, deterministic order, A/B
  mapping commitment, rating policy, protected axes, non-tie quorum, and result
  publication subject;
- immutable Token-Path quarantine.

Manifest traversal rejects symlinks, hard-link surprises, special files, path
escapes, Unicode/case collisions, nested unclassified files, and content or mode
drift. Every downstream consumer recomputes the packet and manifest identities.
The runner-publication manifest uses an identity mapping: each entry path,
relative to the bundle root, must exactly equal one `required_files` repository
path with the same digest. Prefix stripping and path renaming are not allowed.
At packet freeze, the CLI derives its executing Git checkout from
`import.meta.url`; a request cannot choose it. The whole checkout must be clean,
its full HEAD must equal the verified remote checkpoint commit, and the
canonical runtime path-to-digest map must equal both the bundle manifest and
checkpoint. Local identity is attested before and after remote verification.
Every later command and status re-attests that checkout locally, so resume works
without network while code or HEAD drift still fails closed.

Frozen-file staging opens each source once with `O_NOFOLLOW`, reads and rechecks
the same descriptor, and verifies the final path plus every ancestor directory
before and after the read. Each snapshot must match its preregistered digest and,
where the manifest binds them, byte count and mode before any immutable write;
manifest snapshots are hash-checked before parsing. The exact mode is applied and synced on the temporary
descriptor before the no-replace link commit. Node does not expose `openat`; a
privileged mount-namespace mutation capable of defeating ordinary ancestor
revalidation is outside this runner's boundary.

Rating-axis names are lowercase identifiers matching
`[a-z][a-z0-9_]{0,63}`. The scored-axis list contains at most 64 unique names;
the protected-axis list contains at most 65 unique names so it can include the
mandatory `token_path_quarantine` identifier in addition to all scored axes.

## Rating interpretation

Ratings use anonymous labels until all 19 records are frozen. Each record is
paired with a unique Ed25519-signed host execution receipt binding the sole
packet, expert protocol path/hash, complete input identity, output artifact,
rating digest, invocation id, and exact allowlisted channels. The signed channel
attestation must record no Token-Path read/write and no observation write.
Unsigned, reused, drifted, or self-authored-only rows fail. `20-ratings.json`
contains no reveal; `25-mapping-reveal.json` is permitted only afterward.

Ties contribute zero log likelihood and do not count toward the effective
quorum. The seed-derived order and nominal boundaries support reproducibility,
but the panel is related: the runner makes no independent-Bernoulli, population,
model-quality, or empirical alpha/beta claim. Every verdict is advisory and
`promotion_authorized` remains false; promotion requires independent authority.

## Publication boundary

`verify-publication` performs no push. After a separate commit/push grant, it
requires the declared remote branch to resolve to the exact full commit and
recomputes every required path from that commit. A valid publication receipt
must bind the packet and decision digests. The packet preregisters an exact
`receipt_paths` map for packet, ratings, mapping reveal, and decision; each
published path must contain that role's exact durable receipt digest, so hash
permutation across paths is rejected by both publication and later status.
Only then does status become
`PAUSED`, and the workflow must report and stop. Supplying the publication
repository to status performs an optional freshness audit of the remote.

## CLI request envelopes

Every request is a JSON object with exactly the fields declared for its
command. `control_root` is optional on every command; when present, it must
resolve to the same path as `CSTAR_CONTROL_ROOT`. Unknown fields and missing
required fields fail before any command effect.

| Command | Required top-level fields | Other optional fields |
|---|---|---|
| `lease-acquire` | `repo_root`, `run_id`, `resume_token`, `governed_paths` | `control_root` |
| `recover-operation` | `repo_root`, `run_id`, `resume_token` | `control_root` |
| `lease-release` (`completed`) | `repo_root`, `run_id`, `resume_token`, `disposition`, `bundle_root` | `control_root` |
| `lease-release` (`abandoned`) | `repo_root`, `run_id`, `resume_token`, `disposition` | `control_root`, `bundle_root` |
| `freeze-packet` | `repo_root`, `run_id`, `resume_token`, `generation`, `bundle_root`, `runner_publication_repo_root`, `packet` | `control_root` |
| `freeze-ratings` | `repo_root`, `run_id`, `resume_token`, `generation`, `bundle_root`, `ratings` | `control_root` |
| `reveal-mapping` | `repo_root`, `run_id`, `resume_token`, `generation`, `bundle_root`, `reveal` | `control_root` |
| `evaluate` | `repo_root`, `run_id`, `resume_token`, `generation`, `bundle_root` | `control_root` |
| `verify-publication` | `repo_root`, `run_id`, `resume_token`, `generation`, `bundle_root`, `publication_repo_root`, `publication` | `control_root` |
| `status` | `run_id` | `control_root`, `bundle_root`, `publication_repo_root` |

The five generation-bearing commands require `"generation": 1` as a JSON
number. There is no string coercion and no generation-two envelope.

`recover-operation` is the explicit recovery command for an operation guard
whose same-host owner is definitely dead; it never guesses across hosts.
`lease-release` requires `"disposition": "completed"` or
`"disposition": "abandoned"`. Completed release requires `bundle_root` and
the coordinator accepts it only after the run reaches `PAUSED`. Abandoned
release is an explicit abort and may omit `bundle_root`.

The caller creates the resume token before lease acquisition, keeps it private,
and sends the same token on every lease-bound command. The CLI stores only its
SHA-256 digest in `00-source-lease.json`; a successful `lease-acquire` response
contains only `record`, `lock_file`, and `created`, never the raw token. A
minimal acquisition request is:

```json
{
  "repo_root": "/absolute/path/to/source",
  "run_id": "council-run-2026-001",
  "resume_token": "<64 lowercase hexadecimal characters>",
  "governed_paths": ["src", "tests"]
}
```

A later generation request carries the same identifiers and an explicit
numeric generation:

```json
{
  "repo_root": "/absolute/path/to/source",
  "run_id": "council-run-2026-001",
  "resume_token": "<same private token>",
  "generation": 1,
  "bundle_root": "/absolute/path/to/frozen-bundle"
}
```

That second shape is the complete `evaluate` envelope. Commands with nested
`packet`, `ratings`, `reveal`, or `publication` objects additionally enforce
their own exact object contracts.

A completed release request is explicit and bundle-bound:

```json
{
  "repo_root": "/absolute/path/to/source",
  "run_id": "council-run-2026-001",
  "resume_token": "<same private token>",
  "disposition": "completed",
  "bundle_root": "/absolute/path/to/frozen-bundle"
}
```

## Validation

Run the focused Council autoresearch tests, the unregistered-skill policy test,
`npm run typecheck`, distribution validation, and independent result recording.
Do not claim plugin or discovery execution before the separate promotion step.
