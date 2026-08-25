# Corvus Forge Skill Specification

> **HISTORICAL ONLY — TOMBSTONED_PERMANENT**
>
> Forge is defunct. This specification grants no implementation, lifecycle,
> compatibility, fallback, provider, or transport authority. It is retained
> only for historical evidence and regression analysis. Current implementation
> routing is defined by `docs/integrations/codex_mcp_contract.md` and
> `.agents/AGENTS.feature`.

## Purpose

Corvus Forge was a recallable, receipt-producing implementation capability for
bounded Corvus builds. It preserves the CStar lifecycle and operator gates from
request through independent validation. It never substitutes a generic worker,
direct model call, or raw shell mutation for the canonical Forge path.

## Historical Invocation Contract — Non-Actionable

The live route is:

`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> Codex-host
state-only handoff -> DELIVERED_PENDING_VALIDATION -> independent
cstar_record_result`

Current Forge v3 records or queues a Codex-host handoff with
`runner_owner: "codex-host"`, requested `gpt-5.6-luna`/`max`, and separate
host-attested actual identity. Use `unreported` in operator prose and `null` in
structured records when the host provides no attestation. It sets
`host_launch_required: true`, `provider_attempted: false`,
`cognition_launch: false`, and `cstar_launch: false`; CStar does not launch a
provider, cognition, or CStar worker at handoff. Private Hermes `cstar-hub` /
MiniMax-M3 is explicit legacy v2 compatibility material only.

After the state-only response returns `host_handoff_queued` or
`host_handoff_replayed`, the active Codex host must invoke the distinct
post-return consumer with the exact response binding:

```text
npm run consume:forge-host-handoff -- \
  --handoff-path <handoff_path> --handoff-sha256 <handoff_sha256> \
  --request-id <forge_request_receipt_id> --request-sha256 <request_sha256> \
  --execution-receipt-id <execution_receipt_id> --attempt-id <attempt_id> \
  --scope-sha256 <target_paths_sha256>
```

The consumer is a callable, read-only host procedure, not an MCP tool, plugin
hook, model dispatcher, or lifecycle transition. It reads the exact durable
handoff with no-follow descriptor metadata checks; rejects unsafe type,
link-count, owner, mode, schema, hash, job, request, attempt, or scope drift;
and performs the existing bound target/output identity revalidation as its last
filesystem check before exposing `ready_for_host_execution`. A failure exits
nonzero and exposes no job. The local receipt is evidence only: it does not
consume the one-use validator ticket, call `cstar_record_result`, finalize
Forge, launch a provider/cognition/CStar worker, or clean up the handoff.

This closes the missing post-return consumer seam without claiming impossible
filesystem atomicity. A sequential TOCTOU remains between the final identity
check and later host opens/execution, and crash-consistent publication is not a
transaction across CStar state, filesystem state, and host execution.

`cstar_forge_request` and `cstar_forge_authorize` are always no-spend. The
normal authorize transition binds one unambiguous current root-user build
instruction to the immutable request; an exact byte challenge is legacy v2
compatibility evidence only and is not operator-facing workflow.
Current v3 `cstar_forge_execute` is the state-only handoff surface. A provider
attempt exists only when an explicitly selected legacy v2 adapter contract is
used.

## Required Inputs

The canonical request must contain:

- `bead_id`, `decision_id`, objective, scope, and authority lane;
- optional project-information repository and required source callback thread
  ids;
- bounded `target_paths` and complete `required_output_paths`;
- nonempty canonical requested/prohibited action ids and their durable
  authority envelope. Exactly one primary id is allowed; objective, prompt,
  paths, and artifact prose are context only;
- required metrics with thresholds and acceptance rules;
- expected artifacts and callback packet shape;
- spend, live-source, attempt, and retry policy;
- exact package locks where current inputs must not drift;
  - dispatch surface, execution adapter identity, role-plan identity, and, for
  an explicitly selected legacy adapter, its request-bound runtime expectation;
  and
- dirty-root and operator-gate constraints relevant to the task.

Live-intent requests are no-spend `PENDING_AUTH` records. The response returns a
full `authorization_manifest` and `request_sha256`; legacy freeform
authorization references are forbidden and v3 exposes no machine challenge.
CoS fills and verifies those fields from the accepted work item. In the same
root-user turn, `cstar_forge_authorize` recovers the operator's ordinary build,
implement, repair, fix, or route-to-Forge instruction and resolves exactly one
bead, decision, canonical Hall target reference, or exact derived operator
label. A derived label retains, in decision order, shared target-identity tokens
plus structured `qN`, `phaseN`, or `prN` stage tokens; it requires at least
three unique tokens including both classes. Partial, reordered, date-only,
internal-activity, zero-match, and multi-match labels fail closed. The accepted
turn binds to the unchanged request, target scope, every required output, one
attempt, zero retries, synthetic fixtures, no live source collection, and an expiry.
Questions, examples, negation, revocation, bare deictic continuations,
ambiguity, extra/duplicate user records, steering, stale turns, forks, and
subagents fail closed. An existing target directory may contain declared
descendants; an existing file or missing target authorizes only that exact path.

A supported host restart preserves the goal and immutable pending request, not
the authority of earlier prose. The next live authorization requires one fresh
current root-user instruction naming the work. `Continue building <unique
work>` and `Resume the <unique work> build` are ordinary operative variants;
bare continue/proceed, restart acknowledgements, status questions, and reserved
goal packets fail closed. A goal-only turn returns
`forge_operator_signal_required`, with no Hall mutation or provider call.

Before a current v3 request can become `PENDING_AUTH`, the kernel must report
the Codex-host runtime manifest/lineage, distinct code/control roots, and the
bounded host handoff contract. A complete manifest-bound private runtime and
Hermes readiness are required only when an explicitly selected legacy adapter
path is used. The same predicate runs after operator-intent verification and
before its Hall mutation. No-spend requests remain available when live
readiness is red.

For a preserved, unspent `cstar.forge_request.v2` receipt, the current typed
request must reproduce every non-runtime semantic field. CStar keeps the v2
JSON, id, and hash immutable and emits a separate
`cstar.forge_legacy_v2_execution_grant.v1` manifest. The manifest binds the
original action/lock/output digests, current sealed adapter/Hermes runtime, one
attempt, zero retries, no live source, and a newly challenged `synthetic_only`
overlay. Its exact challenge is `CSTAR_FORGE_AUTHORIZE v2-compat-v1 ...
compatibility_manifest_sha256=<sha256>`. It is not reissued as v3 and does not
claim that fixture authority existed in the legacy hash. Before publishing the
challenge, reconciliation atomically binds its independently verified root-user
turn into the legacy row's previously empty requester-lineage extension, only
while the receipt is pending, unauthorised, and unattempted. The v2 JSON, id,
hashes, targets, and scope remain unchanged. A later root task may replay that
same binding but cannot replace it. Missing, partial, or tampered lineage,
sidecar drift, runtime drift, semantic widening, prior authorization, terminal
state, or prior attempt fails closed. Independent validation must come from a
third root thread distinct from this bound requester and the authorizing executor.

A new request's initial `cstar_forge_execute` reservation must occur in the same
root-user turn. The identity is rechecked after runtime/OAuth preflight
immediately before reservation. A later root-user turn normally may only
retrieve an existing idempotency-key receipt. The sole new-reservation exception
is a pending `cstar.forge_pre_provider_continuation.v1` receipt that preserves
the original unrevoked, unexpired authorization and every non-runtime request
field. It grants no new scope or spend authority.

For a new attempt, execution captures the readiness binding after authority,
rechecks the same digest before reservation, and rechecks it after preparation
before marking a legacy adapter attempt started or invoking its adapter. A changed-but-still-
valid runtime is drift, not equivalent readiness. No-op and durable replay do
not require current live readiness and cannot create spend.

The detailed output, producer, adapter, attempt, and validation material below
describes the explicitly selected legacy v2 compatibility lane. Current v3 host
handoff evidence is summarized above and in the kernel API reference.

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
8. pre-provider continuation status, budget class, repair-validation binding,
   and bounded-cycle accounting when applicable; and
9. terminal attempt and request state.

Information-repository update packets and policy-required GitHub
issues/branches/PRs are conditional outputs. PMTs do not review or approve.

## Authority Rules

- CoS owns bounded Green/Yellow execution, evidence packaging, and closeout.
- Red gates, source/spend expansion, merge, push, deploy, restart, secrets, and
  host-configuration mutation require explicit operator authorization.
- PMTs are information repositories only; they receive bounded update packets
  and provide no authority or parallel implementation path. Query only the PMT
  mapped to the active project folder; its absence is not an execution gate.
- MM is inactive and has no active routing, synthesis, ownership, relay, review,
  or execution role. CoS owns estate sequencing, conflicts, and synthesis.
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
The design reference is `unclebob/swarm-forge` branch `six-pack` at commit
`59803dadb38e0e09d5357d749452036e4a82ae60`; no upstream source or orchestration
code is copied into CStar.

## Adapter Contract

The approved private adapter must be sealed into the request by path and
SHA-256. The seal covers the top-level adapter, the absolute Python
interpreter, and, for the write-capable worker, the absolute Node interpreter,
worker safety/evidence helpers, delegate evidence/preflight helpers,
`hermes_minimax_delegate.mjs`, `hermes_runtime_lineage.mjs`, and
`forge_role_plan.mjs`. Invocation copies
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
The sealed CStar-owned stdlib snapshot reads only the owner-safe `minimax-oauth`
record, validates the pinned global MiniMax client, scope, and endpoints, and
keeps the access token in that isolated Python process. It emits no token,
refresh token, credential path, expiry, or fingerprint. Forge performs no OAuth
refresh or auth-file write under the normal execution grant. Unsafe, missing,
out-of-scope, expired, or unable-to-cover-the-fixed-2100-second state fails closed before an
attempt is reserved. Refresh requires a separately authorized credential
lifecycle action.

The sealed prompt is sent over stdin with an exact byte count and SHA-256; it
is never placed in argv. In each fresh role process, the CStar-owned stdlib
entrypoint makes exactly one non-redirecting, non-retrying HTTPS POST to the
fixed MiniMax Anthropic endpoint. It uses no provider SDK, fallback, stream
retry, iteration-limit summary, prompt cache, auxiliary inference, proxy
environment, or second call within that role.

All adapter descendants execute inside an empty-root Bubblewrap namespace with
a private PID namespace, namespace PID 1, `--die-with-parent`, disabled nested
user namespaces, and a cleared environment. CStar projects only the sealed
runtime, exact system runtime files, exact Hermes runtime/profile inputs, an
exact read-only package-lock projection, and an exact shadow workspace. The
child can write only its private I/O directory and shadow workspace. It cannot
see or write the host project, CStar response directory, execution trace, or
unlisted sibling files. The worker interpreter uses `-I -S -B`; timeout and
PID-1 termination tests must prove detached descendants are gone before the
wrapper returns.

The worker runtime performs a non-spending compatibility and OAuth-readiness
preflight before the model-call boundary: CStar-owned manifest/launcher,
root-owned system interpreter, five-file Forge-entrypoint source-content, and
source-instance hashes plus
`--version`, `--help`, and `chat --help` under a sterile temporary HOME/XDG
tree. The console script is only a locator. Exact in-memory source bytes for
`hermes_cli/__init__.py`, `forge_mode.py`, `forge_minimax_oauth.py`,
`forge_provider_journal.py`, and `forge_entrypoint.py` are copied
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

The request seals that complete CStar-owned runtime expectation before spend.
Execute re-resolves and compares it, then creates one fixed 2100 seconds OAuth
horizon (1800-second execution cap plus 300-second margin) before attempt
reservation. The start/deadline and request, execute, decision, adapter, and
runtime identities are hash-bound. The prepared invocation reruns the probe and
all six roles reuse the same deadline and binding; no role requests a sliding
TTL. A durable idempotency-key replay is returned
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

Before every irreversible provider step, the isolated entrypoint appends and
fsyncs the next token-free, hash-chained journal transition:
`not_reached -> capability_consumed -> dispatch_attempted -> request_sent ->
response_headers_received -> response_body_complete`. CStar counts a request
start only from valid `dispatch_attempted` evidence and never from a PID. A
missing, malformed, truncated, regressing, or binding-mismatched journal makes
additional spend unknown. Earlier completed-role usage remains recorded while
that uncertainty remains visible; it can never collapse to
`live_spend=false`.

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

The model edits only the shadow workspace. After response-contract validation,
CStar rechecks every host source and package-lock preimage, stages only the
exact required outputs, and commits them with mode preservation, directory
fsync, rollback, and a final source/lock/output recheck. The host-side
multi-file writer is exception-safe, not crash-atomic. There is no durable
write-ahead journal yet; a process or host crash between replacements requires
independent inspection and cannot be represented as a completed transaction.

Outer success cannot hide inner failure. Missing or mismatched callback fields,
claimed files that do not exist, undeclared artifacts, source-lane use, unknown
spend state, and response-contract violations fail closed.

The child response always remains private and ephemeral. For a successful
commit, CStar persists a parent-built `cstar.forge_delivery_receipt.v1` using
canonical host paths and committed hashes; raw worker bytes and disappearing
shadow paths are never the durable delivery artifact. A contract-invalid
response produces only parent-sanitized
`cstar.forge_worker_response_rejection.v1` evidence containing a stable error,
private-response hash/size, and `raw_response_persisted=false`. A structurally
valid response that cannot be committed produces the equally non-delivery
`cstar.forge_worker_response_unverified.v1` receipt. These artifacts can never
be accepted as delivery evidence.

## Attempt Semantics

- `no_op` validates the contract and spends nothing.
- `live_authorized` must load the durable request, independently recover the
  operator grant, re-hash the exact request, verify locks, and atomically reserve
  the attempt before adapter invocation.
- Reusing an idempotency key returns the existing attempt without new spend.
- Runtime-bundle and symlink-safe trace preflight occurs before provider start.
  An allowlisted failure is `FAILED_RETRYABLE` and `mechanical_no_provider` only
  with exact zero-provider, zero-spend, no-source, no-write evidence.
- CStar repairs and independently validates that local failure, then reserves a
  child cycle with `retry_of_attempt_id` and a new internal idempotency key. The
  original request, hash, authorization, outputs, actions, locks, and provider
  attempt budget remain unchanged; the operator does not restate the build.
- Provider start or ambiguity, unknown spend, missing evidence, scope/worktree/
  lock drift, expiry, revocation, or another request is `provider_or_unknown`
  and cannot inherit continuation.
- The third consecutive identical mechanical failure and tenth total mechanical
  cycle are `BLOCKED`; the latter exhausts the request.
- One reserved orchestration attempt contains the six fixed role calls; it is
  not six independently retryable CStar attempts.
- Failure after adapter start with unknown spend is `UNKNOWN` and consumes the
  grant.
- A structurally valid response is `delivered_unverified`, never immediate
  success.
- There is no automatic role retry or provider/orchestration-attempt retry.
  Bounded pre-provider mechanical continuity is repair/resume accounting, not a
  model retry.

## Validation Contract

Only `cstar_record_result` with an exact execution receipt and hash-verified
evidence may finalize a delivered attempt. The caller supplies bounded artifact
and focused-check paths and hashes only. CStar derives validator identity from
the verified active Codex request, emits `cstar.validation-evidence.v2`, and
requires the validator root thread to differ from both the Forge requester and
authorizing executor. The manifest binds the exact request, authorization,
attempt, adapter, result artifact, bead, repository, and target-set hashes.
Legacy v1 validation remains readable but cannot finalize Forge.

For `FAILED_RETRYABLE`, a positive verified validation may bind the repaired
source artifacts to the exact parent execution receipt without claiming
delivery. CStar checks those artifact hashes against the current adapter bundle
and target preimages before marking the continuation `RESUMED`. Before that
validation, CStar creates the bounded owner-only
`continuation-runtime-evidence.json` under the parent execution receipt so the
validator can hash the exact adapter, interpreter, containment, dependency, and
Hermes runtime binding, together with the named CStar-owned runtime files,
without reading external system paths through the result surface. Goal-resume
evidence supplies continuity only; the original Forge authorization remains the
authority.
Prepared workspace source preimages are checked against the same validation
before `STARTED` or model invocation, and appended same-turn steering is
included in revocation scanning rather than folded into the old authorization.

Positive verified evidence finalizes `SUCCEEDED`; negative verified evidence
finalizes `FAILED_FINAL`. Reported positive evidence without verification is
stored as `INCONCLUSIVE`. Validation persistence and Forge finalization are
transactional.

For an already-terminal `FAILED_FINAL` or `UNKNOWN` attempt, independently
verified `REJECTED`/`FAILURE` or `INCONCLUSIVE` evidence may be linked without
changing execution state. The `terminal_evidence_link` mode updates only the
validation identity and evidence fields. Positive validation is rejected and
cannot resurrect failed delivery.

## Failure Classes

- `request_contract_rejected`
- `operator_authorization_missing_or_drifted`
- `request_or_target_hash_mismatch`
- `package_lock_mismatch`
- `adapter_unregistered_or_runtime_drifted`
- `attempt_replay_or_budget_exhausted`
- `pre_provider_continuation_evidence_invalid`
- `pre_provider_continuation_repair_validation_required`
- `pre_provider_continuation_runtime_or_target_drifted`
- `pre_provider_continuation_no_progress_or_cycle_limit`
- `adapter_spend_unknown`
- `provider_journal_invalid_or_ambiguous`
- `oauth_fixed_horizon_invalid_or_expired`
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

Tests must cover request immutability, initial authority, atomic reservation,
replay, adapter sealing, response semantics, path/link containment,
caught-exception rollback and mode preservation, actual-versus-requested model identity, independent
evidence hashing, trace-tamper rejection, continuation validation binding,
provider-versus-mechanical accounting, no-progress limits, and validation/
finalization rollback. Run focused tests in the
changed repository and CStar contract tests when the control-plane boundary
changes.

Never claim a numeric quality score without a real scorer, nonzero denominator,
formula, exclusions, class coverage, row evidence, and independent probe.

## Installation Posture

This specification authorizes no plugin install, cache mutation, host restart,
merge, push, or deploy. Source proof and live host activation remain separate
operator-gated operations.
