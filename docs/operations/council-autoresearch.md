# Council autoresearch runner

Council autoresearch is a host-owned, terminal-required evaluation workflow for
one evidence-frozen 19-lens Council comparison and exactly one generation. It
does not implement source changes, launch providers, mutate Hall, push Git, or
deploy. Those effects keep their existing Forge and operator gates.

The skill is registered as an agent-native, host-owned `exec-bridge` with an
explicit terminal-required contract and no kernel fallback. Generated plugin
bundles advertise that external bridge but do not embed arbitrary `src/`
runtime files, so standalone plugin execution is not claimed. Registration and
distribution metadata remain capability declarations, not execution authority.

## Runtime and external trust

The registered runner is Linux-only. Before any lease or control-root write it
requires a canonical machine identity and trusted procfs with a proven PID-
namespace mapping. It also requires `O_NOFOLLOW`, single-link regular file
checks, atomic hard-link publication and recovery claims, directory `fsync`, and
Git common-directory semantics. Any runtime or filesystem that cannot provide
those guarantees fails closed; no compatibility fallback is supported.

Before `lease-acquire`, an operator-controlled provisioning process must create:

`CSTAR_CONTROL_ROOT/council-autoresearch/trust-policy.json`

The policy must be a private, single-link, non-group/world-writable regular file
and must pin all of the following:

- the Ed25519 public execution authority and its key digest;
- receipt issuer `cstar-host-invocation-bridge-v1`;
- the exact allowed host input channels;
- forbidden Token-Path runtime access;
- the canonical runner repository URL and branch.

The corresponding private key is preprovisioned in the authorized host
invocation bridge. The runner does not generate, select, rotate, or authorize a
signer. A packet-carried public key is accepted only when it matches this
external policy. Signed receipts attest the configured bridge invocation and
bound inputs/outputs; they do not prove model identity or independent sampling.

Before `lease-acquire`, the authorized caller generates 32 random bytes encoded
as 64 lowercase hexadecimal characters and supplies that resume token through a
private request channel. Create its directory under `umask 077` and explicitly
`chmod 600` the request. It must be a runner-owned, single-link `0600` regular
file in a runner-owned private real directory. The runner opens it with
`O_NOFOLLOW` and nonblocking I/O, holds the descriptor while validating bounded
JSON bytes, and rechecks the descriptor and pathname identity before any command
effect. The runner never returns or prints the raw capability; it stores only its
SHA-256 digest. Keep the token out of commits, reports, receipts, and
terminal/session logs. Retain it privately so an identical request can recover a
lost response without creating a different lease identity.

## Formal lifecycle and advisory evaluator

The coordinator implements a formal lifecycle for this evaluation run only:
`NEW`, `LEASED`, `PACKET_FROZEN`, `RATINGS_FROZEN`, `MAPPING_REVEALED`,
`DECIDED`, and `PAUSED`. Those phases are derived from a fully validated receipt
prefix; they are not Hall, Forge, source, Git, deployment, or production state.

Inside that lifecycle, the comparison is a pure deterministic evaluator over a
verified packet, frozen ratings, and the later mapping reveal. It performs no
external effect and grants no authority. All four verdicts are advisory, and
`promotion_authorized` remains false. A coordinator command may immutably record
the evaluator output, but that receipt does not change the evaluator's authority
class.

## Durable receipt chain

The runner writes private, immutable receipts beneath
`CSTAR_CONTROL_ROOT/council-autoresearch/<run-id>/`:

| Receipt | Meaning |
|---|---|
| `00-source-lease.json` | Exact repository, HEAD, governed paths, recursive source manifest, and hashed resume token |
| `10-packet.json` | Sole preregistration and packet identity |
| `20-ratings.json` | Complete frozen 19-lens ratings with 19 signed execution receipts; no mapping reveal |
| `25-mapping-reveal.json` | Post-ratings reveal bound to the preregistered mapping commitment |
| `30-decision.json` | Exactly-once generation-1 decision |
| `40-publication.json` | Verified remote ref, commit, and required file hashes; derives `PAUSED` |

Receipts use no-clobber publication. Byte-identical replay is idempotent;
conflicting content fails without overwriting the earlier receipt. Phase is
derived only from a fully validated receipt prefix. `PAUSED` additionally
requires fresh verification of the exact remote branch, commit, and file hashes;
a preplanted or merely self-consistent JSON file cannot invent completion.
An exact replay may remove the writer's sole UUIDv4 temporary hard-link alias
only after matching the committed target's bytes, mode, inode, and two-link
state. The original writer tolerates that post-commit cleanup race; ordinary
reads and conflicting replays never remove an alias.
Packet replay checks the already-frozen packet before writing an experiment
claim, so a conflicting replay cannot leave an orphan claim that blocks a
different valid run.

The result publication subject also preregisters `receipt_paths` with exactly
four semantic roles: `packet`, `ratings`, `reveal`, and `decision`. Each role
must name a unique member of `required_paths`. Publication validation compares
the digest at each named remote path with that role's exact local receipt; a
bag of otherwise matching digests cannot swap or obscure receipt meaning.

## Source lease

The exclusive anchor is keyed by the canonical repository root and stored under
the Git common directory as an immutable lease intent; the sealed
`00-source-lease.json` pair stores the fully attested record. Acquisition happens
before HEAD/status checks. Only a holder with the matching run ID and caller-owned
resume token can verify or release it. An exact lost-response replay returns the
same record and lease ID with `created:false`, without returning the token. A
contender that fails `O_EXCL` never enters cleanup. The runner rechecks HEAD,
cleanliness of every governed path, and the recursive manifest before and after
each durable operation. Attestation requires the real index to match the
captured commit at stage zero; rejects assume-unchanged and skip-worktree flags,
split indexes, replacement refs, grafts, and alternate object databases; and
compares each bounded worktree file byte-for-byte with its raw committed blob.
The logical index and worktree manifest must match a second scan, while the
canonical single-link index inode and metadata and all observed worktree file
identities must remain unchanged across the scan. It does not run Git status or
clean filters, so repository-configured filter commands cannot execute during
attestation or conceal worktree drift. The kernel, filesystem enforcement, and
same-UID processes remain part of the local trusted computing base; no sequence
of userspace observations can exclude a hostile write after its final check.

The control root must be outside the source repository so receipt writes cannot
invalidate source cleanliness. Stale ownership has no automatic timeout;
recovery is an explicit operator action because a guessed dead owner is less
safe than a blocked run.

All production repository inspection uses the fixed `/usr/bin/git` executable.
The runner verifies that executable and its ancestors are canonical,
root-controlled, and not group/world writable; it supplies a minimal child
environment with system/global Git configuration, replacement objects, prompts,
hooks, and filesystem monitoring disabled. Ambient object, index, worktree, or
Git-directory overrides fail before any lease or network effect. Remote-ref
reads run outside the governed repository so repository-local URL rewrites or
transport commands cannot redirect them.

Lease acquisition, every durable command, and release share one short-lived
repository lifecycle guard. Guards, recovery-owner records, and source locks are
fully written and file-synced through `0600` descriptors before one exact hard-link
publication; the containing directory is synced before and after removing the
temporary alias. Interrupted publication may repair only the record-derived exact
alias after proving its owner dead and revalidating its bytes and inode. Unexplained
aliases, hostile metadata, replacement bytes, or uncertain post-unlink directory
durability remain fail-closed behind the lifecycle guard. Acquisition durably
publishes that guard before creating a control directory, source lock, or receipt.
Command and release
guards bind the authorized lease and resume-token digest; acquisition guards bind
the canonical repository/common directory, control target, run, pre-generated
lease identity, exact lease-intent digest, token digest, and governed-path digest. Full active-lease and
source verification occurs only after the caller owns this common guard, so a
paused old command cannot cross a release and replacement acquisition.

Ordinary commands never inspect and delete an existing guard: an exact explicit
core recovery call is required. Recovery ownership binds the exact guard bytes,
device, inode, operation kind, and operation ID. Removal additionally requires
stable Linux machine, boot, PID-namespace, procfs-visible PID, and process-start
evidence proving the original operation is definitely dead. A live or stopped
owner, another host or namespace, malformed metadata, target drift, or ambiguous
OS evidence remains blocked for operator investigation. Nested PID namespaces are
bound through the kernel's `NSpid` mapping. Concurrent recovery calls are
serialized before the stale inode is claimed by a fixed hard link; a different
replacement inode at the guard pathname is preserved.

Token-authorized recovery can distinguish an unfinished release (the exact
source lock remains) from a committed release (the lock is absent while the exact
source receipt and source attestation remain valid). Exact acquisition recovery
requires the caller token, scope, and operation ID. It may remove a dead guard
with no effects, repair only guard-derived intent/body/seal publication aliases,
and preserve a committed intent or body for same-token replay. It never invents a
missing seal or removes a receipted lease under another capability. A recovery process that
itself crashes leaves its owner/claim records fail-closed for operator
investigation; they are never taken over automatically. The registered terminal
command does not expose either recovery call yet. Same-UID processes remain in
the local trusted computing base.

## Packet and manifests

The packet binds:

- the canonical 19 Council experts with one unique protocol path and digest each;
- recursive, no-follow artifact manifests for the evaluation contract,
  anonymous variants A/B, evidence, rubric, protocols, and the runner
  publication checkpoint;
- the committed source HEAD and source-manifest digest, governed paths,
  experiment identity, verified contract-manifest identity, seed,
  deterministic order, A/B
  mapping commitment, rating policy, protected axes, non-tie quorum, and result
  publication subject;
- immutable Token-Path quarantine.

Manifest traversal rejects symlinks, hard-link surprises, special files, path
escapes, Unicode/case collisions, nested unclassified files, and content or mode
drift. Every downstream consumer recomputes the packet and manifest identities.

The contract is a verified recursive artifact manifest, not a caller-supplied
scalar digest. Its file paths, modes, sizes, and SHA-256 digests are recomputed
from the bundle whenever the packet is frozen or revalidated. Keep contract
files under a distinct manifest path so they cannot alias protocols, evidence,
rubric, variants, or runner publication material.

## Runner checkpoint publication

The runner must already be committed and published before a packet can freeze.
Use the read-only `verify-runner-checkpoint` command to create the checkpoint
record from a configured Git remote name, branch, full commit, and required
path-to-digest map. This command performs a separately authorized Git/network
read: it resolves the configured remote, canonicalizes its URL, verifies the
exact remote ref and commit, and hashes files from that commit. It never fetches,
pushes, commits, checks out, or rewrites Git state.

The runner-v2.2 rebuild identity primitives additionally attest the exact canonical
runner set against one commit-valued local HEAD and unchanged canonical index,
worktree bytes, Git topology, and absence of noncanonical JavaScript siblings that
could shadow canonical TypeScript imports or nearer package/TypeScript config
files that could alter their resolution. Online verification brackets the remote-ref
and committed-blob check with matching local attestations; the offline form
repeats only the local binding and performs no network read. Production wrappers
derive the loaded verifier's repository from its real module path and reject a
different caller-nominated publication checkout. This is governed-source identity,
not whole-checkout or runtime-loader identity: ignored dependencies and the
Node/TypeScript loader remain outside this checkpoint and move behind the later
frozen native runtime boundary. Wiring these primitives into packet freeze,
persistence, and resume also remains a later rebuild checkpoint; the current
schema-2.1 packet path must not yet be described as enforcing executing-HEAD
identity. Callers must supply an already loaded and structurally verified bundle
manifest; packet integration must bind it to the signed manifest reference before
using these primitives.

The runner-v2.2 rebuild also exposes offline frozen-bundle staging primitives.
`stageFrozenPacketBundle` validates the complete seven-manifest packet input closure
before creating a private destination, rejects cross-role path/case/ancestor
collisions and aggregate resource overruns, and immutably stages only exact bounded
regular files in UTF-8 path order. Staging requires `O_NOFOLLOW` and nonblocking
file opens. Exact partial replay is allowed; conflicts, unexplained residue, source
or destination races, extras, and source/destination overlap fail closed.
`verifyFrozenPacketBundle` reverifies the final exact destination inventory without
a Git remote read. `stageFrozenFile` is only a low-level bounded partial-staging
helper; it does not validate packet closure or establish admission. The destination
is a dedicated packet-input root; future signed outputs require a separate sibling
or an explicit sealed union inventory. These inventory-only primitives do not
verify the execution trust policy, executing HEAD, remote publication, or receipt
admission. They are not wired into the schema-2.1 packet lifecycle and file
presence is not a commit boundary; durable admission waits for the later sealed-
receipt checkpoint. Same-UID mutation after the final observation and privileged
mount aliases remain inside the declared local trust boundary.

The source lease now uses the descriptor-backed receipt-pair primitive: a private,
runner-owned, single-link `0600` `00-source-lease.json` body plus a separately
committed `.seal.json`. The seal binds the exact body bytes, source-lease bytes,
lease and run identities, source HEAD, and source-manifest digest. Exact body-only
evidence derives `NEW`; seal-only, malformed or tampered pairs, hard-link aliases,
and out-of-order suffixes fail closed. Acquisition recovery may classify and
repair only temporary aliases derived from the exact dead operation guard. It
preserves a matching intent or body for same-token replay, removes only the dead
guard after validation, and never invents a missing seal. The `10` through `40`
receipts still use the schema-2.1 body commit points; converting the complete
lifecycle to schema-2.2 sealed admission remains a later cohesive checkpoint.

The schema-neutral receipt-recovery primitive is internal and not reachable from
the coordinator, barrel API, or CLI. It can normalize only exact operation-bound
JSON aliases whose body, optional claim, and seal byte digests are supplied by a
revalidated dead-operation authority, in body-then-claim-then-seal order. It
never creates missing evidence. An exact guard-derived staged temporary is
bounded and snapshotted as opaque private bytes, then removed without parsing,
digest admission, or promotion; committed and complete artifacts still require
exact JSON and bound digests. The primitive treats body-plus-claim without a seal as
non-admitting, and re-fsyncs every private target directory before success.
Alias normalization alone neither authorizes guard removal nor validates a run
transition. Schema-2.2 activation must additionally hold the exact recovery
owner, bind the guard/effect plan, validate the frozen bundle and receipt
semantics, re-attest source, and use a bounded precreated experiment-claim
namespace.

The target-bound receipt-command wire contract is also internal and unused. It
leaves every legacy `lease-command` guard byte-for-byte compatible, while a
distinct `receipt-command` guard binds a closed `10` through `50` receipt name
and exact body/seal digests. The packet-only variant additionally binds the
experiment, claim, frozen-bundle plan, entry count, and aggregate byte count.
Generic lease recovery deliberately refuses this new guard kind; no receipt
writer, coordinator path, barrel export, or CLI can create it until dedicated
receipt-operation recovery and schema-2.2 admission land together.

The schema-2.2 experiment-claim namespace foundation is internal and unused.
It derives a two-level SHA-256-sharded, exact-private claim path beneath the
control root, binds the experiment, run, lease, packet, and exact source-lease
body digest, and gives recovery only the one guard-derived temporary path.
Namespace preparation is bounded and fsynced before a future receipt guard;
ordinary preflight and verification remain read-only. Existing valid flat
schema-2.1 claims permanently reserve the same experiment identity, while
malformed, linked, redirected, conflicting, or foreign evidence fails closed.
No coordinator, writer, barrel API, CLI, or schema-2.1 path uses this namespace
until packet body, frozen closure, claim, and packet seal activate atomically.

The schema-neutral frozen-effect plan is likewise internal and unreachable from
the coordinator, barrel API, CLI, and schema-2.1 staging path. It binds the packet
identity, deterministic destination root, exact UTF-8-sorted file inventory, raw
modes, byte counts, and aggregate bounds without binding a transient source
location. Validation snapshots only own enumerable data properties and rejects
accessor-backed plans before invoking a getter; it never trusts a memoized
validation result. Full activation still requires target-bound file publication and
recovery, a bundle-wide preflight, exact inventory rescan, offline verification,
and the receipt-operation recovery owner. The later operation path must not be
combined with the legacy UUID-alias staging classifier because an operation UUID
has the same lexical form but different recovery authority.

The internal operation-bound file primitive supplies that per-file publication
and recovery layer without activating it. Every temporary path derives from the
future guard owner PID and operation ID. A writer-plausible partial staged file
may be removed but never promoted; an exact committed two-link target/temporary
inode may be normalized while preserving the target; complete targets are
replayed without replacement. Raw bytes, modes, sizes, ownership, link counts,
parent identity, foreign temporary absence, and the frozen operation authority
are rechecked around every mutation, and stable outcomes re-sync the parent so a
retry closes prior unlink-sync uncertainty. Bundle-wide recovery and guard
removal remain deliberately unavailable until the target-bound receipt operation
lands.

The internal bundle-wide operation foundation composes that plan and per-file
primitive without making either reachable. It prepares and fsyncs only the exact
empty private directory tree, admits only a complete UTF-8 prefix plus at most
one writer-reachable interruption and an absent suffix, snapshots every entry
before mutation, and repairs only exact guard-derived staged or committed
aliases. Stable replay and recovery re-prove a complete destination offline and
do not require the original witness. Extras, foreign temporaries, special files,
ordering gaps, authority drift, overlap, and durability uncertainty fail closed.
Guard creation/removal, receipt-body and claim ordering, packet sealing, and
coordinator admission remain deferred to the cohesive schema-2.2 activation.

The canonical URL and branch must match the external trust policy. The local
runner manifest and checkpoint `required_files` must be the exact same
path-to-digest mapping—not merely the same multiset of content hashes—and must
include these canonical paths:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `.agents/skill_registry.json`
- `.agents/AGENTS.feature`
- `.agents/plugins/marketplace.json`
- `.agents/skills/council-autoresearch/SKILL.md`
- `.agents/skills/council-autoresearch/PROVENANCE.md`
- `.agents/skills/council-autoresearch/council-autoresearch.feature`
- `docs/operations/council-autoresearch.md`
- `docs/architecture/SKILL_REGISTRY.md`
- `docs/architecture/SKILL_PERMUTATIONS.md`
- `docs/integrations/host_native_skill_contract.md`
- `docs/integrations/cstar_capability_discovery_api.md`
- `docs/host-native-skill-bridge.md`
- `docs/terminal-skill-migration.md`
- `distributions/README.md`
- `GEMINI.md`
- `gemini-extension.json`
- `plugins/corvus-star/.codex-plugin/plugin.json`
- `plugins/corvus-star/skills/corvus-star/SKILL.md`
- `plugins/corvus-star/README.md`
- `plugins/corvus-star/lineage.json`
- `src/core/council_autoresearch/artifact_manifest.ts`
- `src/core/council_autoresearch/contract_schema.ts`
- `src/core/council_autoresearch/index.ts`
- `src/core/council_autoresearch/contracts.ts`
- `src/core/council_autoresearch/coordinator.ts`
- `src/core/council_autoresearch/coordinator_state.ts`
- `src/core/council_autoresearch/decision.ts`
- `src/core/council_autoresearch/execution_trust.ts`
- `src/core/council_autoresearch/experiment_claim.ts`
- `src/core/council_autoresearch/frozen_bundle.ts`
- `src/core/council_autoresearch/frozen_bundle_effect_plan.ts`
- `src/core/council_autoresearch/frozen_bundle_operation.ts`
- `src/core/council_autoresearch/frozen_bundle_fs.ts`
- `src/core/council_autoresearch/frozen_operation_file.ts`
- `src/core/council_autoresearch/git_trust.ts`
- `src/core/council_autoresearch/operation_identity.ts`
- `src/core/council_autoresearch/packet.ts`
- `src/core/council_autoresearch/publication.ts`
- `src/core/council_autoresearch/rating.ts`
- `src/core/council_autoresearch/receipt_seal.ts`
- `src/core/council_autoresearch/repository_lease.ts`
- `src/core/council_autoresearch/repository_lease_acquisition.ts`
- `src/core/council_autoresearch/repository_lease_acquisition_recovery.ts`
- `src/core/council_autoresearch/repository_lease_recovery_artifact.ts`
- `src/core/council_autoresearch/repository_lease_contract.ts`
- `src/core/council_autoresearch/repository_lease_recovery.ts`
- `src/core/council_autoresearch/repository_lease_state.ts`
- `src/core/council_autoresearch/repository_operation_file.ts`
- `src/core/council_autoresearch/repository_operation_guard.ts`
- `src/core/council_autoresearch/repository_private_file.ts`
- `src/core/council_autoresearch/repository_receipt_operation_contract.ts`
- `src/core/council_autoresearch/repository_receipt_recovery.ts`
- `src/core/council_autoresearch/runner_identity.ts`
- `src/core/council_autoresearch/runner_publication_paths.ts`
- `src/core/council_autoresearch/source_attestation.ts`
- `src/core/skill_registry.ts`
- `src/packaging/distribution_content.ts`
- `src/packaging/distributions.ts`
- `src/tools/council-autoresearch-request.ts`
- `src/tools/council-autoresearch.ts`
- `scripts/run-tsx.mjs`
- `scripts/runtime-env.mjs`
- `tests/unit/council-autoresearch/test_adversarial.test.ts`
- `tests/unit/council-autoresearch/test_cli_schema.test.ts`
- `tests/unit/council-autoresearch/test_experiment_claim.test.ts`
- `tests/unit/council-autoresearch/test_frozen_bundle.test.ts`
- `tests/unit/council-autoresearch/test_frozen_bundle_effect_plan.test.ts`
- `tests/unit/council-autoresearch/test_frozen_bundle_operation.test.ts`
- `tests/unit/council-autoresearch/test_frozen_operation_file.test.ts`
- `tests/unit/council-autoresearch/test_helpers.ts`
- `tests/unit/council-autoresearch/test_operation_identity.test.ts`
- `tests/unit/council-autoresearch/test_publication_entries.test.ts`
- `tests/unit/council-autoresearch/test_receipt_seal.test.ts`
- `tests/unit/council-autoresearch/test_repository_lease.test.ts`
- `tests/unit/council-autoresearch/test_repository_lease_acquisition_recovery.test.ts`
- `tests/unit/council-autoresearch/test_repository_lease_crash_safety.test.ts`
- `tests/unit/council-autoresearch/test_repository_lease_lifecycle_adversarial.test.ts`
- `tests/unit/council-autoresearch/test_repository_lease_lifecycle.test.ts`
- `tests/unit/council-autoresearch/test_repository_receipt_operation_contract.test.ts`
- `tests/unit/council-autoresearch/test_repository_receipt_recovery.test.ts`
- `tests/unit/council-autoresearch/test_repository_receipt_staged_recovery_adversarial.test.ts`
- `tests/unit/council-autoresearch/test_resource_bounds.test.ts`
- `tests/unit/council-autoresearch/test_runner_checkpoint.test.ts`
- `tests/unit/council-autoresearch/test_runner_identity.test.ts`
- `tests/unit/council-autoresearch/test_runner.test.ts`
- `tests/unit/council-autoresearch/test_source_attestation.test.ts`
- `tests/unit/test_council_autoresearch_skill.test.ts`
- `tests/unit/test_current_documentation_contract.py`
- `tests/unit/test_skill_registry_audit.py`
- `tests/unit/test_skill_registry_shape.test.ts`
- `tests/unit/test_terminal_skill_policy.test.ts`
- `scripts/audit_skill_registry.py`

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
must bind the packet and decision digests. Only then does status become
`PAUSED`, and the workflow must report and stop. Status without a publication
repository cannot report `PAUSED` from the receipt alone.

The result-publication `repository` is also a configured remote name. Remote
verification records its canonical URL, exact branch, full commit, and the
semantic receipt path mapping. `verify-publication` and a fully validating
`status` cross the same separately authorized read-only Git/network boundary;
neither command grants or performs publication.

## Terminal commands

Run all commands through the pinned TypeScript wrapper:

```text
node scripts/run-tsx.mjs src/tools/council-autoresearch.ts <command> --request <request.json>
```

Supported commands are `lease-acquire`, `freeze-packet`, `freeze-ratings`,
`reveal-mapping`, `evaluate`, `verify-runner-checkpoint`,
`verify-publication`, `status`, and `lease-release`.

`verify-runner-checkpoint`, `verify-publication`, and a fully validating
`status` may contact only the configured Git remote named by the request and
validated against the pinned canonical URL. Terminal availability is intrinsic
to this registered runner but grants no kernel fallback or broader shell
authority.

## Validation

Run the focused Council autoresearch, registry-shape, terminal-policy, and
documentation-contract tests, `npm run typecheck`, distribution validation,
release-bundle validation, and independent result recording. Treat generated
plugin metadata as an external `exec-bridge` declaration, not bundled runtime
proof.
