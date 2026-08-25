# Corvus Forge Skill Specification

## Purpose

Corvus Forge is a recallable, receipt-producing implementation capability for
bounded Corvus builds. It preserves the CStar lifecycle and operator gates from
request through independent validation. It never substitutes a generic worker,
direct model call, or raw shell mutation for the canonical Forge path.

## Invocation Contract

The live route is:

`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> private Hermes cstar-hub /
minimax MiniMax-M3 bounded-six-role-manifest-v1 -> delivered_unverified ->
independent cstar_record_result`

`cstar_forge_request` and `cstar_forge_authorize` are always no-spend.
`cstar_forge_execute` is the only model-spend and implementation surface.

## Required Inputs

The canonical request must contain:

- `bead_id`, `decision_id`, objective, scope, and authority lane;
- optional project-information repository and required source callback thread
  ids;
- bounded `target_paths` and complete `required_output_paths`;
- requested and prohibited actions;
- required metrics with thresholds and acceptance rules;
- expected artifacts and callback packet shape;
- spend, live-source, attempt, and retry policy;
- exact package locks where current inputs must not drift;
- dispatch surface, execution adapter identity, role-plan identity, and
  request-bound Hermes runtime expectation; and
- dirty-root and operator-gate constraints relevant to the task.

Live requests additionally require a CStar-verifiable operator authorization
attestation bound to both the exact target scope and every required output, one
attempt, zero retries, no live source collection, and an expiry. An existing
target directory may contain declared descendants; an existing file or missing
target authorizes only that exact path.

## Outputs

The skill produces durable, machine-readable records for:

1. immutable request and request hash;
2. one-shot operator authority and expiry;
3. atomic attempt reservation and idempotent replay;
4. adapter runtime seal and model-identity evidence;
5. ordered role receipts, hash-chained handoffs, provider-request counts, and
   per-role token usage;
6. QA response artifact and strict exact-output file manifest;
7. independent validation evidence; and
8. terminal attempt and request state.

Information-repository update packets and policy-required GitHub
issues/branches/PRs are conditional outputs. PMTs do not review or approve, and
MM is legacy.

## Authority Rules

- CoS owns bounded Green/Yellow execution, evidence packaging, and closeout.
- Red gates, source/spend expansion, merge, push, deploy, restart, secrets, and
  host-configuration mutation require explicit operator authorization.
- PMTs are information repositories only; they receive bounded update packets
  and provide no authority or parallel implementation path. Query only the PMT
  mapped to the active project folder; its absence is not an execution gate.
- MM is legacy. CoS owns estate sequencing, conflicts, and synthesis.
- CStar records state but cannot elevate a request, registry entry, adapter, or
  callback into authority.
- Codex subagents may analyze or review. They never replace Forge implementation.

## Bounded Producer Topology

The fixed producer chain is `specifier -> coder -> cleaner -> architect ->
hardener -> QA` under plan `bounded-six-role-manifest-v1`. The specifier emits
the bounded implementation contract; coder emits the complete candidate
manifest; cleaner simplifies it; architect repairs boundary and dependency
problems; hardener makes failures deterministic and fail closed; QA verifies
the whole result and emits the only final exact-output manifest accepted by the
write adapter.

Each role runs in a fresh sealed Hermes process and performs exactly one
fixed-host, non-redirecting, non-retrying MiniMax request. The specifier sees
the sealed mission/materials. The coder receives the accepted specification as
its immediate handoff; every later role receives both that immutable
specification contract and the immediately preceding mutable handoff. Every
handoff binds its schema, plan id/hash, role, ordinal phase, previous-handoff
SHA-256, and canonical output SHA-256. The provider envelope and ordered CStar
receipt also bind `specification_handoff_sha256`; receipts retain input/output
handoff hashes and token usage. Any role, identity, phase, schema, or hash
mismatch terminates the chain before a later role or file application.

The role-plan digest is the SHA-256 of the canonical fixed role order. The
request-bound adapter runtime-content digest separately seals the role policies
and handoff implementation.

One CStar attempt contains all six role calls. Zero retries means no role call
and no orchestration attempt is relaunched; a partial failure retains bounded
provider-request counts and conservative spend evidence and consumes the
attempt under the durable spend rules.

This is a no-Git bounded adaptation, not the genuine upstream SwarmForge
six-pack. The upstream tmux/Git-worktree orchestration remains separately
operator-gated and must not be claimed by a
`bounded-six-role-manifest-v1` receipt. Upstream calls its fifth producer
`hardender`; this adaptation intentionally uses the clearer name `hardener`.

## Adapter Contract

The approved private adapter must be sealed into the request by path and
SHA-256. The seal covers the top-level adapter, the absolute Python
interpreter, and, for the write-capable worker, the absolute Node interpreter,
`forge_worker_safety.py`, `hermes_minimax_delegate.mjs`, and
`hermes_runtime_lineage.mjs` plus `forge_role_plan.mjs`. Invocation copies
the verified scripts into an owner-only runtime directory and passes only an
allowlisted, non-secret environment. The write-capable worker:

- invokes Hermes with profile `cstar-hub` and requested model
  `minimax-oauth/MiniMax-M3`;
- records actual model identity only when reported by the host;
- accepts a bounded response and strict manifest for required paths only;
- rejects control text, surrounding whitespace, dot-segment aliases, and
  canonically duplicate required outputs before reservation or spawn;
- derives model-visible paths from the durable canonical request, renders them
  once as a project-relative single-line canonical JSON array with count and
  SHA-256, and labels those strings as data rather than instructions;
- requires exactly one manifest entry per listed relative path, with no
  trimming, alias rewriting, case folding, Unicode normalization, URL decode,
  glob, prefix, suffix, or basename matching;
- verifies canonical containment, regular-file type, link count, and callback
  identity before any write;
- uses staged replacement with file-mode preservation, file and created-
  directory rollback for caught exceptions, and file/directory fsync; and
- persists a hash-addressed response artifact.

The prompt path array guides model compliance only. The sealed absolute set
remains authoritative for post-model containment and is not disclosed by the
generated output contract; operator-authored mission text remains separately
accountable for what it names. Target-material headings are project-relative. A pre-manifest
adapter rejection emits a fixed value-free code and `live_spend=false`; a
rejected model manifest retains only whole-manifest and index/count evidence.

An explicitly registered response-only adapter is materialized as a single
self-contained script. If it needs undeclared adjacent runtime files, the
owner-only bundle cannot resolve them and execution fails closed; such
dependencies must first become part of the sealed adapter contract.

The exact Forge argv retains the supported empty `context_engine` toolset
marker, but the Forge-private Hermes entrypoint never loads the generic agent,
tool registry, plugins, MCP, or any tool implementation. It receives safe-mode
variables plus the non-secret sealed provider identity before startup, and
inherits no provider, cloud, shell, loader, or credential secret. The only
profile selector is `HERMES_HOME` pointing at the existing private
`cstar-hub` profile; it contains no token. CStar never opens Hermes `auth.json`.
The sealed stdlib Hermes snapshot reads only the owner-safe `minimax-oauth`
record, validates the pinned global MiniMax client, scope, and endpoints, and
keeps the access token in that isolated Python process. It emits no token,
refresh token, credential path, expiry, or fingerprint. Forge performs no OAuth
refresh or auth-file write under the normal execution grant. Unsafe, missing,
out-of-scope, expired, or less-than-2100-second state fails closed before an
attempt is reserved. Refresh requires a separately authorized credential
lifecycle action.

The sealed prompt is sent over stdin with an exact byte count and SHA-256; it
is never placed in argv. In each fresh role process, the Hermes-owned stdlib
entrypoint makes exactly one non-redirecting, non-retrying HTTPS POST to the
fixed MiniMax Anthropic endpoint. It uses no provider SDK, fallback, stream
retry, iteration-limit summary, prompt cache, auxiliary inference, proxy
environment, or second call within that role.

All adapter descendants execute inside sealed Bubblewrap containment with a
private PID namespace, namespace PID 1, `--die-with-parent`, disabled nested
user namespaces, a cleared environment, and a read-only host view. Only the
authorized project root, response directory, and invocation bundle are
writable. The worker interpreter uses `-I -S -B`; timeout and PID-1 termination
tests must prove detached descendants are gone before the wrapper returns.

The worker runtime performs a non-spending compatibility and OAuth-readiness
preflight before the model-call boundary: launcher, root-owned system interpreter,
dependency-lock, four-file Forge-entrypoint source-content, and source-instance hashes plus
`--version`, `--help`, and `chat --help` under a sterile temporary HOME/XDG
tree. The console script is only a locator. Exact in-memory source bytes for
`hermes_cli/__init__.py`, `forge_mode.py`, `forge_minimax_oauth.py`, and
`forge_entrypoint.py` are copied
with exclusive owner-private writes into a fresh snapshot. The root-owned
system Python launches that snapshot with `-I -S -B`, no site-packages path,
and a fresh empty `sys.pycache_prefix`; original-tree `.pyc`, `.pth`,
`sitecustomize`, and `usercustomize` code is unreachable. No prompt, token,
refresh authority, or network/source authority is passed to the compatibility
probes. The OAuth probe reads only sealed Hermes auth state and returns a
redacted readiness contract. Live mode
requires the CStar-bound proof outside the dual synthetic-test gate, resolves
one exact byte set, compares every lineage field, and launches the snapshot
made from those same bytes before credential opening.

The request seals that complete Hermes runtime expectation before spend.
Execute re-resolves and compares it, then requires a redacted ready
`minimax-oauth` proof with at least 2100 seconds of life before attempt
reservation. The prepared invocation reruns the probe and requires the same
proof immediately before launch. A durable idempotency-key replay is returned
without requiring fresh OAuth because it performs no reservation or provider
call. Production rejects ambient `HERMES_BIN`; only the dual
synthetic-test gate may supply an override. The verified preflight remains in
the prepared, started, and terminal success/failure traces. Durable attempt
metadata binds both the Hermes runtime-content digest and the terminal trace
SHA-256 through the adapter-version evidence. A terminal trace is mandatory:
if it cannot be written and read back, CStar cannot return delivery. The durable
failure evidence records `trace-last:<sha256-or-unavailable>`.

Request receipt, execute receipt, decision id, adapter ref, and runtime-content
digest are bound through CStar intent, worker environment, delegate prompt,
Hermes environment, provider request guard, and the private provider-response
envelope. The delegate validates the echoed tuple and provider-reported exact
`MiniMax-M3` identity before accepting model text. Each role response also
echoes and validates the role, ordinal phase, role-plan id/hash, and immediate
input-handoff hash plus `specification_handoff_sha256` before its handoff can
advance the chain.

The live invocation places `--provider` and `--model` after `chat`; Hermes'
chat-subparser defaults otherwise overwrite top-level values with nulls.

Delegate failures use the bounded `cstar.forge_delegate_failure.v1` contract.
Stable reason, sealed provider/requested model/profile, separately reported
actual identity and source, spend/spend-unknown, live-source state, and exact
role evidence are the complete whitelist. Role evidence is accepted only when
the topology, canonical plan digest, fixed prefix order, phases, handoff chain,
immutable specification anchor, provider-request counts, and aggregate token
totals validate. Raw stdout/stderr, prompt text, paths, environment, unknown
keys, and unbounded values are never retained. Actual model remains null unless
`model_source=provider_reported` and the identity passes the bounded format
check. CStar projects that whitelist once for both the execution trace and
returned result. Unrecognized worker identifiers, counters, paths, and ledger
fields are discarded; any returned `wrote_to` value is reconstructed only from
the CStar-owned response artifact after containment and private-mode checks.

The multi-file writer is exception-safe, not crash-atomic. There is no durable
write-ahead journal yet; a process or host crash between replacements requires
independent inspection and cannot be represented as a completed transaction.

Outer success cannot hide inner failure. Missing or mismatched callback fields,
claimed files that do not exist, undeclared artifacts, source-lane use, unknown
spend state, and response-contract violations fail closed.

Rejected worker manifests retain bounded evidence without retaining model
content. After the model response is parsed but before any accepted delivery, a
manifest-contract or bounded-application failure writes the standard private
adapter response with status `rejected`, zero changed files, a stable failure
class, and only the canonical manifest hash, byte count, field presence/types,
and entry counts. Raw manifest values, file paths/content, callback values, and
unknown field names are not persisted or emitted. The kernel hashes and retains
that receipt-local artifact while continuing to mark the execution terminally
failed; it can never be accepted as delivery evidence.

## Attempt Semantics

- `no_op` validates the contract and spends nothing.
- `live_authorized` must load the durable request, independently recover the
  operator grant, re-hash the exact request, verify locks, and atomically reserve
  the attempt before adapter invocation.
- Reusing an idempotency key returns the existing attempt without new spend.
- Runtime-bundle and symlink-safe trace preflight occurs before the durable
  attempt is marked started. Failure before adapter spawn is `FAILED_FINAL`.
- One reserved orchestration attempt contains the six fixed role calls; it is
  not six independently retryable CStar attempts.
- Failure after adapter start with unknown spend is `UNKNOWN` and consumes the
  grant.
- A structurally valid response is `delivered_unverified`, never immediate
  success.
- There is no automatic role retry or orchestration-attempt retry in the
  bootstrap contract.

## Validation Contract

Only `cstar_record_result` with independent hash-verified evidence may finalize
a delivered attempt. The validator must be distinct from the Forge producer and
must supply bounded artifact paths and hashes plus focused test evidence.

Positive verified evidence finalizes `SUCCEEDED`; negative verified evidence
finalizes `FAILED_FINAL`. Reported positive evidence without verification is
stored as `INCONCLUSIVE`. Validation persistence and Forge finalization are
transactional.

## Failure Classes

- `request_contract_rejected`
- `operator_authorization_missing_or_drifted`
- `request_or_target_hash_mismatch`
- `package_lock_mismatch`
- `adapter_unregistered_or_runtime_drifted`
- `attempt_replay_or_budget_exhausted`
- `adapter_spend_unknown`
- `adapter_reported_failure`
- `manifest_or_callback_mismatch`
- `path_or_file_type_violation`
- `caught_exception_write_rollback`
- `crash_recovery_inspection_required`
- `delivered_pending_independent_validation`
- `validation_evidence_unverified`
- `validation_transaction_rolled_back`

Every failure returns a compact blocker and preserves the durable state needed
to prevent unsafe replay.

## Verification Requirements

Tests must cover request immutability, one-shot authority, atomic reservation,
replay, adapter sealing, response semantics, path/link containment,
caught-exception rollback and mode preservation, actual-versus-requested model identity, independent
evidence hashing, and validation/finalization rollback. Run focused tests in the
changed repository and CStar contract tests when the control-plane boundary
changes.

Never claim a numeric quality score without a real scorer, nonzero denominator,
formula, exclusions, class coverage, row evidence, and independent probe.

## Installation Posture

This specification authorizes no plugin install, cache mutation, host restart,
merge, push, or deploy. Source proof and live host activation remain separate
operator-gated operations.
