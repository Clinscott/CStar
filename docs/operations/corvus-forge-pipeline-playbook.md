# Corvus Forge Pipeline Playbook

Corvus Forge is the CStar-governed implementation lane. It converts an accepted,
bounded build objective into an independently validated delivery without
bypassing operator gates or CStar lifecycle state.

## Canonical Route

`User -> CoS -> CStar bead/decision -> cstar_forge_request ->
cstar_forge_authorize -> cstar_forge_execute ->
bounded-six-role-manifest-v1 through private Hermes
cstar-hub / minimax MiniMax-M3 ->
delivered_unverified -> independent cstar_record_result -> CoS closeout`

When targets are inside a project with a mapped PMT, read that repository once
for bounded context and send it a bounded update packet after meaningful state
changes. Do not query unrelated PMTs, and do not block execution on repository
availability. PMTs grant no review or execution authority, and MM is legacy.
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
- Corvus Forge builds through its sealed private adapter.
- The fixed producer chain is `specifier -> coder -> cleaner -> architect ->
  hardener -> QA`. Each role has a distinct bounded responsibility; QA alone
  emits the final exact-output manifest for adapter validation and application.
- PMTs are information repositories only; they receive state-update packets and
  grant no execution, review, approval, or routing authority.
- MM is legacy. CoS owns cross-project sequencing and conflict handling.
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
- authority lane, requested actions, and prohibited actions;
- measurable acceptance rules and required artifacts;
- exact-head or package-lock hashes where existing inputs matter;
- live-source policy, retry budget, and spend policy;
- the canonical Forge surface and approved adapter reference;
- a callback packet shape; and
- dirty-root isolation rules when unrelated changes exist.

Live authorization is valid only when CStar independently recovers the exact
operator message from the named Codex thread and turn, verifies its hash and
both target and required-output scope, records its expiry, binds it to the
canonical request, and records a one-attempt, zero-retry grant. Required outputs
must already be proven inside an explicit existing target directory or equal to
an explicit file/prospective target. A caller-supplied reference is not
authority.

No-spend or pending requests remain non-executable. The request response must
say whether authority is bound and name the exact blocker.

## Authorize Gate: No Spend

`cstar_forge_authorize` binds one explicit root-user build instruction or one
immutable CStar goal-continuation receipt to the unchanged pending request. It
performs no provider call, consumes no attempt, and cannot expand targets,
outputs, actions, source lanes, spend, retry, or operator gates.

## Execute Gate: One Atomic Attempt

`cstar_forge_execute` must receive the matching durable receipt, exact request
fields, operator authorization reference, adapter reference, and stable
idempotency key. Before invocation it verifies:

- bead, decision, authorization, adapter, and callback linkage;
- canonical request and target hashes;
- package locks and required output manifest;
- authorization expiry, attempt budget, and live-source prohibition;
- the request-bound Hermes runtime expectation and its exact launcher,
  interpreter, source-closure, and runtime-content hashes;
- sealed adapter, Python/Node interpreter, worker-helper, delegate, role-plan,
  and lineage hashes;
- an owner-only no-follow execution-trace preflight; and
- path containment under the authorized project and target roots.

Attempt reservation is atomic. Replaying an idempotency key returns the durable
attempt without invoking the model again. Trace/runtime preflight completes
before the attempt is marked started. An adapter-spawned exception is `UNKNOWN`;
a pre-spawn failure is `FAILED_FINAL`. Both consume or close the one-shot request
according to the durable receipt. There is no automatic retry.

One CStar orchestration attempt contains the six ordered role calls. Each role
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

## Private Hermes / MiniMax-M3 Adapter

Live implementation uses the private Hermes `cstar-hub` profile pinned to
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

The canonical Hermes launcher and its complete runtime expectation are sealed
at request time and compared again before reservation, preflight, and launch.
Before attempt reservation, CStar runs a contained, non-spending readiness
probe through that sealed Hermes runtime. The probe reports only
`minimax-oauth`, `oauth`, `cstar-hub`, ready/not-ready, refresh-required, and
the required minimum TTL; it never returns an access token, refresh token,
credential path, expiry, or fingerprint. A second probe immediately before
launch must match the first redacted proof. An existing durable idempotency-key
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
after the model boundary is `UNKNOWN` and consumes the one-shot grant.

The write-capable worker accepts only a strict manifest for explicitly required
paths. It rejects traversal, symlinks, hardlinks, non-regular files, duplicate
paths, undeclared outputs, missing callbacks, callback mismatches, over-limit
responses, and inner failure packets even when an outer wrapper says `ok`.
For caught exceptions, staged replacement restores previous bytes and modes,
removes newly created files and directories, fsyncs changed directories, and
leaves no staging or backup residue. This is not process-crash atomic: no
durable write-ahead journal currently exists to repair a crash between file
replacements.

The adapter and Hermes child receive minimal allowlisted environments without
secret-bearing host values. `HERMES_HOME` selects the existing private
`cstar-hub` profile; it is not a credential environment variable. CStar never
opens Hermes `auth.json` and never receives a token. The sealed Hermes-owned
OAuth reader opens only the `minimax-oauth` record with owner-only regular-file
checks, pins the global MiniMax OAuth/inference identity, and keeps the access
token inside the isolated Python process. It performs no refresh or auth-file
write under the normal Forge grant. Missing state, unsafe state, insufficient
scope, or less than 2100 seconds of token life fails before reservation; a
refresh-required result needs a separate operator-authorized credential
lifecycle window. Source material travels over byte-count- and SHA-256-bound
stdin, not an argv value. The exact argv retains the supported empty
`context_engine` marker, while the Hermes-owned Forge entrypoint loads no tools,
plugins, MCP, generic agent, or provider SDK. For each role process it makes
exactly one fixed-host MiniMax HTTPS POST with no redirect, retry, fallback,
proxy environment, prompt cache, or auxiliary request. The adapter may write the
bounded delivery and its response artifact only. It
may not collect live sources, merge, push, deploy, restart, mutate secrets or
host configuration, expand scope, or directly edit Hall/SQLite.

The complete Python-worker, Node-delegate, and Hermes tree runs inside sealed
Bubblewrap containment with a private PID namespace, namespace PID 1,
`--die-with-parent`, disabled nested user namespaces, cleared ambient
environment, and a read-only host view. Only the authorized project root,
response directory, and owner-private invocation directory are writable.
Timeout kills use `SIGKILL`; namespace teardown kills detached and `setsid()`
descendants before CStar returns. The worker Python starts with `-I -S -B`.

The Hermes console stub is a locator, not lineage proof. The delegate hashes
the locator, root-owned system Python, dependency locks, and the exact reviewed
stdlib closure: `hermes_cli/__init__.py`, `forge_mode.py`, and
`forge_minimax_oauth.py`, and `forge_entrypoint.py`; CStar also seals
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

A structurally valid adapter packet is persisted under
`work/forge-executions/<execution_receipt_id>/adapter-response.json` with byte
count and SHA-256. The attempt becomes `delivered_unverified`, not `SUCCEEDED`.
Model prose, a worker callback, tests claimed by the worker, and file existence
are delivery evidence only.

An independent validator must inspect the actual project state, run focused
checks matching the changed behavior, hash the validated artifacts, and call
`cstar_record_result` with the Forge execution receipt. Positive reported
verdicts without verified evidence are stored as `INCONCLUSIVE`.

- verified positive evidence finalizes `SUCCEEDED`;
- verified negative evidence finalizes `FAILED_FINAL`;
- inconclusive or unverified evidence cannot terminalize success; and
- validation persistence and Forge finalization occur in one transaction.

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
- the adapter runtime changed after the request was sealed;
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
