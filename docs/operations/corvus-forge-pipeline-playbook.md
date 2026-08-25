# Corvus Forge Pipeline Playbook

Corvus Forge is the CStar-governed implementation lane. It converts an accepted,
bounded build objective into an independently validated delivery without
bypassing operator gates or CStar lifecycle state.

## Canonical Route

`User -> CoS -> CStar bead/decision -> cstar_forge_request ->
`cstar_forge_authorize -> cstar_forge_execute -> native parent ->
DELIVERED_UNVERIFIED -> independent cstar_record_result -> CoS closeout`

The active connection is `forge-native-codex-swarm-v1`. CStar persists the
durable SET, immutable request, policy intersection, one idempotent run lease,
generation/tombstone state, worker receipts, and the control receipt. The
native parent owns integration and evidence aggregation. It may use zero to
three useful leaves; every leaf has a disjoint exact write set and no leaf may
create descendants. Worker packages never contain SET authority, cancellation
secrets, control receipts, or lifecycle capability.

The effective authority is the fail-closed intersection
`durable_SET ∩ immutable_request ∩ connection_policy ∩ run_lease`. Missing
native capabilities, empty intersections, path escape/overlap, duplicate
idempotency keys, missing durable request rows, and generation tombstones reject
before execution. Requested `gpt-5.6-luna`/`max` is recorded separately from
host-attested actual identity; absent attestation is `unreported`. Delivery is
always `DELIVERED_UNVERIFIED`; only an independent validator may support
`cstar_record_result`.

The former Hermes/MiniMax, host-handoff, AutoBot, CLI, bridge, provider, and
legacy v2/v3 sections below are historical compatibility material. They are not
an executable fallback for the native connection and are retained only as
readable history until their tombstone/quarantine evidence is independently
reviewed.

When targets are inside a project with a mapped PMT, read that repository once
for bounded context and send it a bounded update packet after meaningful state
changes. Do not query unrelated PMTs, and do not block execution on repository
availability. PMTs are project-scoped information repositories only; they grant
no ownership, execution, approval, review, routing, monitoring, or lifecycle
authority. MM is inactive and has no active routing, synthesis, ownership, relay,
review, or execution role.
Add GitHub issue, branch, and PR packaging only when repository policy requires
those artifacts.

Public AutoBot delegation, direct Hermes calls, shell `chant`/`evolve`, and
Codex-subagent implementation are not Forge substitutes.

## Roles

- The operator grants direction, spend, red gates, and scope expansion.
- CoS owns bounded Green/Yellow execution, evidence packaging, lifecycle
  updates, and closeout.
- CStar records the durable request, attempt, validation, and bead state. It is
  canonical state, not authority above the operator or platform.
- The native Forge parent persists a bounded plan and aggregates only to
  `DELIVERED_UNVERIFIED`; the former v2/v3 adapter and host-handoff lanes are
  historical and tombstoned, not fallbacks.
- The fixed producer chain is `specifier -> coder -> cleaner -> architect ->
  hardener -> QA`. Each role has a distinct bounded responsibility; QA alone
  emits the final exact-output manifest for adapter validation and application.
- PMTs are information repositories only; they receive state-update packets and
  grant no execution, review, approval, or routing authority.
- MM is inactive and has no active routing, synthesis, ownership, relay, review,
  or execution role. CoS owns cross-project sequencing and conflict handling.
- CorvusEye or another independent validator may evaluate the delivery when the
  gate requires producer/reviewer separation.

## Request Gate: No Spend

`cstar_forge_request` validates and persists an immutable request. The request
itself never invokes Hermes, MiniMax, a browser, live source collection, GitHub,
or source mutation.

Every request must bind:

- an explicit CStar `bead_id` and `decision_id`;
- optional project-information repository and required CoS callback thread ids;
- objective, bounded target roots, and every required output path;
- authority lane, nonempty canonical requested actions, and canonical
  prohibited actions. Exactly one of `request_receipt`, `response_only`, or
  `project_files` is primary; prose and paths cannot grant action authority;
- measurable acceptance rules and required artifacts;
- exact-head or package-lock hashes where existing inputs matter;
- live-source policy, retry budget, and spend policy;
- the canonical Forge surface and approved adapter reference;
- a callback packet shape; and
- dirty-root isolation rules when unrelated changes exist.

`cstar_forge_request` never spends. From a normal operator instruction such as
“Build the Moonshot UX improvement proposed in PR 32,” CoS resolves the accepted
bead/proposal and fills the machine contract: bead, decision, targets, required
outputs, actions, locks, synthetic/no-live-source boundaries, adapter/runtime
lineage, attempt limit, and retry budget. A live-intent request is persisted as
`PENDING_AUTH`; a legacy freeform `operator_authorization_ref` is forbidden. Its
response exposes the full canonical `authorization_manifest` and
`request_sha256`, with no machine challenge in the normal v3 workflow.

In the same root-user turn, CoS verifies that manifest and calls
`cstar_forge_authorize` with the receipt id and hash it already holds. The
authorize tool independently recovers the operator's single build, implement,
repair, fix, or route-to-Forge instruction and resolves one exact bead,
decision, canonical Hall target reference, or exact derived operator label. The
derived label is narrow: shared target identity plus ordered `qN`, `phaseN`, or
`prN` decision stages, at least three unique tokens total. Partial, reordered,
date-only, internal-activity, zero-match, and multi-match labels fail closed, as
do questions, examples, negation, revocation, bare deictic continuations,
duplicate user records, and steering. The operator is never asked to paste a
request hash or challenge. A caller-supplied prose reference is not authority.

If source activation requires a supported Codex restart before authorization,
the goal and immutable pending request survive but earlier prose is not replayed
as authority. The operator sends one fresh ordinary instruction naming the
work, for example `Continue building TokenPath Q0 phase one.` Bare continue,
restart acknowledgements, status questions, and reserved goal packets cannot
select or authorize a request. A goal-only turn returns a human-readable
`forge_operator_signal_required` result with no mutation or provider call.
This fresh-instruction rule governs a request that has not begun. It does not
discard an already-authorized request after a proven zero-provider mechanical
cycle; that request follows the bounded continuation contract below.

A strict, unspent `cstar.forge_request.v2` receipt is never rewritten or
reissued. When the caller supplies the semantically identical current typed
request, CStar returns the existing id/hash plus a timestamp-free
`cstar.forge_legacy_v2_execution_grant.v1` compatibility manifest. That
manifest replaces legacy action prose with the narrower `project_files`
authority, prohibits all red-gated actions and live source collection, adds the
newly challenged `synthetic_only` boundary, and seals the current adapter and
Hermes runtime. Its distinct sole-input challenge begins
`CSTAR_FORGE_AUTHORIZE v2-compat-v1` and binds
`compatibility_manifest_sha256`. Unknown fields, semantic drift, package-lock
drift, runtime drift, any existing attempt or authorization, or a non-pending
receipt fails before authority is granted. Reconciliation first binds the
verified root-user reconciliation turn into the all-null requester-lineage
extension. That bind is one-time and replayable but not replaceable; partial
lineage fails closed. The original canonical JSON, request hash, bead, decision,
targets, required outputs, and locks remain unchanged. A delivered v2 attempt
can complete only when `cstar_record_result` binds current output and response
artifacts from an independent third root thread distinct from requester and executor.

Required outputs must already be proven inside an explicit existing target
directory or equal to an explicit file/prospective target. No-spend, pending,
expired, terminal, or receipt-mismatched requests remain non-executable and do
not emit a new challenge.

## Legacy v2 adapter execution (explicit selection only)

For an initial reservation, `cstar_forge_execute` must run in the same root-user
turn that supplied the operative build instruction. It receives the matching durable receipt,
exact request fields, returned authorization reference, adapter reference, and
stable idempotency key. Before invocation it verifies:

- bead, decision, authorization, adapter, and callback linkage;
- supported live-launch binding with distinct code and control roots;
- synchronized package manifest/lock metadata and a non-symlink installed
  dependency inventory matching the hidden lock;
- the complete private-runtime manifest, launcher, and all five declared
  source hashes;
- canonical request and target hashes;
- package locks and required output manifest;
- authorization expiry, attempt budget, and live-source prohibition;
- the request-bound Hermes runtime expectation and its exact launcher,
  interpreter, source-closure, and runtime-content hashes;
- sealed adapter, Python/Node interpreter, worker safety/evidence helpers,
  delegate evidence/preflight helpers, role-plan, and lineage hashes;
- an owner-only no-follow execution-trace preflight; and
- path containment under the authorized project and target roots.

The authorizing turn is checked once before preflight and again after runtime/
OAuth preflight immediately before writable Hall access and reservation. A later
root-user turn normally cannot create an attempt. The sole exception is an exact
`cstar.forge_pre_provider_continuation.v1` receipt for the same immutable request,
original authorization, thread, targets, required outputs, actions, locks, and
spend/source boundary. A later same-thread turn may consume that receipt after
revocation and expiry checks; appended same-turn steering is scanned as later
input and can revoke the grant. It does not create new authority. Ordinary replay
uses the same idempotency key, is checked before current runtime or package-lock
gates, and never invokes the provider.

Live request persistence and authorization mutation use the same runtime
predicate. Execute captures its binding after authority and requires it before
reservation and again after preparation, immediately before adapter start. A
changed runtime may inherit the request only when an independent
`cstar_record_result` receipt validates the repair artifacts and CStar binds
their hashes to the exact next runtime. Unvalidated runtime drift remains
terminal. A red pre-reservation verdict leaves no provider attempt. No-spend
request and no-op validation remain available for diagnosis.

Before requesting that independent validation, CStar writes or refreshes the
owner-only `continuation-runtime-evidence.json` beneath the parent execution
receipt. The validator hashes that bounded artifact together with the CStar-
owned adapter and Hermes files it names; the artifact seals the current
Python/Node interpreters and process containment without exposing external
system paths through the result surface. Once validation is bound, CStar
verifies rather than replaces the artifact. After workspace preparation, CStar
also compares the projected source preimages with that validation before the
attempt is marked `STARTED` or any model process can run.

Attempt reservation is atomic. Replaying an idempotency key returns the durable
attempt without invoking the model again. A failure with validated evidence of
zero provider requests, zero ambiguous dispatch, zero spend, no live source,
and no workspace commit may become `FAILED_RETRYABLE` with budget class
`mechanical_no_provider`. CStar keeps the request `AUTHORIZED`, records the
exact failure/trace/runtime fingerprint, repairs and independently validates the
local defect, then resumes the same request without asking the operator to issue
another build instruction. Provider start, ambiguous dispatch, unknown spend,
missing evidence, scope/worktree/lock drift, expiry, revocation, or another
request never qualifies.

Mechanical continuity is bounded but is not provider retry budget. The third
consecutive identical failure becomes `BLOCKED`; the tenth total mechanical
cycle becomes `BLOCKED` and the request `EXHAUSTED`. Each continuation has a new
internal idempotency key and `retry_of_attempt_id`, but the request hash and
authorization remain unchanged. Zero retries still means zero provider, role,
or orchestration retries.

One provider attempt contains the six ordered role calls. Each role
runs in a fresh sealed Hermes process and may make exactly one fixed-host,
non-retrying MiniMax request. Zero retries means neither an individual role nor
the orchestration attempt may be rerun. A failed or invalid role handoff stops
the chain before later roles and records conservative partial request-count and
spend evidence.

This runtime is the explicit no-Git adaptation
`bounded-six-role-manifest-v1`. It preserves the producer-role topology and
handoff discipline but is not the genuine upstream SwarmForge six-pack, whose
tmux and Git-worktree orchestration remains separately operator-gated. Upstream
names its fifth role `hardender`; the bounded adaptation intentionally calls it
`hardener`. Do not describe the bounded adaptation as an upstream SwarmForge
execution.

The topology reference is `unclebob/swarm-forge`, branch `six-pack`, inspected
at commit `59803dadb38e0e09d5357d749452036e4a82ae60`. CStar copied no upstream
source, shell, Clojure, tmux, or Git-worktree implementation; the private
runtime and receipts are CStar-owned. The inspected tree exposed no root
license file, so the boundary is design inspiration only rather than vendoring
or source reuse.

### Private Hermes / MiniMax-M3 Adapter

Legacy v2 compatibility uses the private Hermes `cstar-hub` profile pinned to
`minimax-oauth/MiniMax-M3`. Receipts record provider, requested model, actual model,
model-source evidence, reasoning profile, and adapter version separately. If
the host does not report actual model identity, record `unreported`; never infer
it from the provider or request.

Before `hermes chat` can start, the sealed delegate resolves and hashes the
owner-controlled executable and probes only `--version`, top-level `--help`,
and `chat --help` under an empty owner-private HOME/XDG tree. It supplies no
prompt, profile, provider, model, credential, or source lane. The prepared
invocation binds that executable hash into the later delegate call; direct
delegate use repeats the same non-spending preflight defensively. Compatibility
failure is `FAILED_FINAL` with no model spend.

The canonical CStar-owned private launcher, manifest, and complete runtime
expectation are sealed
at request time and compared again before reservation, preflight, and launch.
Before attempt reservation, CStar runs a contained, non-spending readiness
probe through that sealed runtime. CStar creates one immutable 2100 seconds
horizon (1800-second execution cap plus 300-second margin) bound to the request
receipt, execute receipt, decision, adapter, runtime digest, start, and
deadline. The probe reports only `minimax-oauth`, `oauth`, `cstar-hub`,
ready/not-ready, refresh-required, and that exact non-secret horizon; it never
returns an access token, refresh token, credential path, observed expiry,
remaining TTL, or fingerprint. A second probe immediately before launch and
all six roles reuse the same deadline and binding; no later role requests a
sliding TTL. An existing durable idempotency-key
replay is returned before this freshness check because replay performs no new
reservation, provider call, or spend.
Production rejects ambient `HERMES_BIN`; that override exists only behind the
dual synthetic-test gate. The verified preflight remains present in the
prepared, started, and terminal success/failure execution traces. The durable
adapter version binds the Hermes runtime-content digest and terminal-trace
SHA-256 so a result cannot erase the runtime that produced it. The terminal
trace is required for delivery; a missing or unreadable terminal trace fails
closed, and durable failure evidence records
`trace-last:<sha256-or-unavailable>`.

Provider and model overrides are passed after the `chat` subcommand because
Hermes scopes those overrides to the chat parser. Placing them before `chat`
allows the subparser defaults to erase the requested identity.

Nonzero delegate output is reduced to `cstar.forge_delegate_failure.v1` before
it crosses the worker boundary. Only a stable reason, sealed provider/requested
model/profile, explicitly reported actual identity, model-source evidence,
spend/spend-unknown, live-source status, and strictly validated role evidence
survive. The role projection requires canonical topology/plan identity, ordered
handoff/specification hashes, request counts, and internally consistent token
totals. Raw stdout, stderr, prompts, paths, environment values, unknown fields,
and arbitrary error text are discarded. Missing or malformed spend evidence
after the model boundary is `UNKNOWN` and consumes the one-shot grant. Every
provider child also appends token-free, hash-chained transitions from
`not_reached` through `response_body_complete`. Provider start is counted only
from a valid `dispatch_attempted` transition, never from a PID. Missing,
truncated, regressing, or binding-mismatched evidence is unknown; known usage
from completed earlier roles remains visible while additional spend stays
unknown.

The write-capable worker accepts only a strict manifest for explicitly required
paths. It rejects traversal, symlinks, hardlinks, non-regular files, duplicate
paths, undeclared outputs, missing callbacks, callback mismatches, over-limit
responses, and inner failure packets even when an outer wrapper says `ok`.
For caught exceptions, staged replacement restores previous bytes and modes,
removes newly created files and directories, fsyncs changed directories, and
leaves no staging or backup residue. This is not process-crash atomic: no
durable write-ahead journal currently exists to repair a crash between file
replacements.

The adapter and private provider child receive minimal allowlisted environments without
secret-bearing host values. `HERMES_HOME` selects the existing private
`cstar-hub` profile; it is not a credential environment variable. CStar never
opens Hermes `auth.json` and never receives a token. The sealed CStar-owned
OAuth reader opens only the `minimax-oauth` record with owner-only regular-file
checks, pins the global MiniMax OAuth/inference identity, and keeps the access
token inside the isolated Python process. It performs no refresh or auth-file
write under the normal Forge grant. Missing state, unsafe state, insufficient
scope, or inability to cover the fixed 2100 seconds horizon fails before reservation; a
refresh-required result needs a separate operator-authorized credential
lifecycle window. Source material travels over byte-count- and SHA-256-bound
stdin, not an argv value. The exact argv retains the supported empty
`context_engine` marker, while the CStar-owned Forge entrypoint loads no tools,
plugins, MCP, generic agent, or provider SDK. For each role process it makes
exactly one fixed-host MiniMax HTTPS POST with no redirect, retry, fallback,
proxy environment, prompt cache, or auxiliary request. The adapter may write the
bounded delivery and its response artifact only. It
may not collect live sources, merge, push, deploy, restart, mutate secrets or
host configuration, expand scope, or directly edit Hall/SQLite.

The complete Python-worker, Node-delegate, and Hermes tree runs inside an
empty-root Bubblewrap namespace with a private PID namespace, namespace PID 1,
`--die-with-parent`, disabled nested user namespaces, and a cleared ambient
environment. Exact runtime/profile/control inputs are read-only. Only private
I/O and an exact shadow workspace are writable; the real project, durable
response directory, execution trace, and unlisted host siblings are absent.
Timeout kills use `SIGKILL`; namespace teardown kills detached and `setsid()`
descendants before CStar returns. The worker Python starts with `-I -S -B`.

A console stub is a locator, not lineage proof. The retired Hermes/AutoBot
checkout is not part of the runtime lineage. The delegate
hashes the CStar-owned manifest and launcher, root-owned system Python, and the
exact reviewed stdlib closure: `hermes_cli/__init__.py`, `forge_mode.py`,
`forge_minimax_oauth.py`, `forge_provider_journal.py`, and
`forge_entrypoint.py`; CStar also seals
`forge_role_plan.mjs` into the adapter
runtime. Preflight executes those bytes from an exclusive private
snapshot. Live mode requires the CStar-bound proof, resolves one matching byte
set, and launches a snapshot made from those same in-memory bytes. System Python
runs with `-I -S -B`, no site-packages path, and a fresh empty
`sys.pycache_prefix`, so original `.pyc`, `.pth`, `sitecustomize`, and
`usercustomize` code is unreachable. The request/execute/decision/adapter tuple
and runtime digest are validated again in the Hermes provider-response envelope
before delivery; drift fails before credential opening or spend.

Each response envelope additionally binds the role, ordinal phase, role-plan
id/hash, immediate input-handoff hash, and
`specification_handoff_sha256`. The specifier emits the immutable accepted
specification; the coder receives it as the immediate handoff; cleaner through
QA receive both that immutable specification anchor and the immediately
preceding schema-validated mutable handoff. CStar verifies the canonical
handoff SHA-256 chain and exact role-plan digest, records the six ordered role
receipts, per-role input/output hashes, token usage, and partial request counts,
and accepts a delivery manifest only from the final QA handoff. The role-plan
digest covers canonical role order; the runtime-content digest seals policies
and handoff code.

## Delivery Is Not Success

The worker response is validated only in private I/O. CStar rechecks all source
and package-lock preimages, commits only exact required outputs, then persists a
parent-built `cstar.forge_delivery_receipt.v1` under
`work/forge-executions/<execution_receipt_id>/adapter-response.json` with
canonical paths, committed hashes, byte count, and SHA-256. Invalid private
responses yield sanitized rejection evidence; valid-but-uncommitted responses
yield an unverified evidence receipt. Raw model bytes and shadow paths are not
durable artifacts. A committed packet becomes `delivered_unverified`, not
`SUCCEEDED`.

An independent validator must inspect the actual project state, run focused
checks matching the changed behavior, hash the validated artifacts, and call
`cstar_record_result` with the Forge execution receipt. Positive reported
verdicts without verified evidence are stored as `INCONCLUSIVE`.

- verified positive evidence finalizes `SUCCEEDED`;
- verified negative evidence finalizes `FAILED_FINAL`;
- inconclusive or unverified evidence cannot terminalize success; and
- validation persistence and Forge finalization occur in one transaction.

Verified negative or inconclusive evidence may also link to an already-terminal
`FAILED_FINAL` or `UNKNOWN` attempt. This `terminal_evidence_link` changes only
validation identity/evidence fields; it cannot reopen delivery, change
request/attempt status, spend, retry eligibility, result/error, or completion,
and positive validation cannot resurrect the attempt.

If either half of finalization fails, neither state change survives.

## Evidence and Quality Claims

The closeout packet must include:

- request, authorization, attempt, and validation identifiers;
- exact request/target/output lock hashes;
- role-plan identity, ordered role receipts, handoff hashes, per-role usage,
  and provider-request counts;
- requested and actual model identity evidence;
- changed paths and response-artifact hashes;
- focused commands with exit status and relevant output;
- exclusions, untested surfaces, and residual risk;
- information-repository update and CorvusEye packets when applicable; and
- explicit remaining operator gates.

Do not invent Gungnir or quality scores. A numeric score is usable only when its
scorer ran with a nonzero denominator, formula, exclusion accounting, class
coverage, row evidence, and an independent probe. Development proof is not
production or locked-holdout readiness.

## Stop Conditions

Return to CoS and fail closed when:

- request, authority, adapter, target, package, output, callback, or hash linkage
  is missing or mismatched;
- the adapter runtime changed without an exact independent continuation-repair
  validation binding;
- the attempt is expired, replayed under a different contract, exhausted, or
  ambiguous;
- output escapes its authorized roots or violates the manifest;
- live-source use, red-gated action, or scope/spend expansion is requested;
- independent evidence cannot verify the delivery; or
- CStar cannot persist the required lifecycle transition.

Return cross-project conflicts and synthesis to CoS. Do not bypass the blocker
with legacy MM, direct Hall/SQLite writes, direct Hermes, AutoBot, a Codex
worker, or an ad hoc state file.

## Closeout and Host Activation

CoS records the validation, updates or resolves the bead when its acceptance
criteria are met, and sends a compact `STATE_UPDATE` to the project information repository after
meaningful work. Source completion does not install a plugin, refresh a cache,
restart Codex, or prove live host precedence. Those remain separate explicit
operator-gated activation steps followed by live source-versus-runtime probes.
