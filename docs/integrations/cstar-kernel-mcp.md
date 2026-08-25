# cstar-kernel MCP — API Reference

> The authoritative kernel surface for Corvus Star. READ, MUTATION, and REQUEST
> tools expose bounded kernel primitives and gates. `cstar_forge_execute` is the
> sole EXECUTION tool: live mode requires a durable immutable request, verified
> one-shot operator attestation, exact request/output locks, atomic attempt
> reservation, and a sealed private Hermes/MiniMax-M3 adapter. Delivery remains
> unverified until independent `cstar_record_result` validation finalizes it.
> Host agents (Claude, Gemini, Codex) call these tools directly over MCP rather
> than shelling out to `./cstar`.

## Source of Truth

- **Server:** `bin/cstar-kernel-mcp.js` → `src/tools/cstar-kernel-mcp.ts`
- **Metadata catalog:** `src/tools/cstar-kernel-mcp/contracts/tool_catalog.ts`
- **Schema/handler registration:** `src/tools/cstar-kernel-mcp/register_core_tools.ts`
- **Server name:** `cstar-kernel`
- **Transport:** stdio (JSON-RPC 2.0, newline-delimited)
- **Current SDK protocol:** `2024-11-05` over stdio
- **2026-07-28 readiness posture:** tool handlers are protocol-session independent; cross-call state uses explicit CStar handles
- **Host surfaces:** `gemini-extension.json#mcpServers` registers Gemini directly;
  Codex uses the global WSL direct-stdio wrapper contract and the Corvus Star
  plugin supplies a skill only.

The driver `bin/cstar-kernel-mcp.js` spawns Node with the TSX loader against
`src/tools/cstar-kernel-mcp.ts`, inherits stdio, and exits with the child
status. It retains a small launcher parent so the child receives the sanitized,
host-neutral environment before startup. The MCP child keeps stdin open and
exits cleanly when its transport closes.

For Codex Desktop-on-WSL,
`/home/morderith/.codex/bin/wsl/cstar-kernel-mcp-wrapper` launches the direct
source stdio lineage. `bin/cstar-kernel-mcp-bridge.js` is compatibility-only
and may launch the same direct child. TCP mode and
`scripts/cstar-mcp-tcp-daemon.js` are retired and fail closed; no CStar TCP
listener is an authorized fallback.

Direct-stdio operator attestation is a local single-user trust boundary. The
kernel binds an authorization reference to the current thread id and verifies
the referenced Codex session record and message hash, but it cannot establish a
cryptographic identity boundary against another process running as the same OS
user with access to that session store. CStar therefore assumes same-UID local
processes are inside the operator's trusted computing base. Do not use this
attestation design as a multi-user or hostile-local-process security boundary.

### Codex steered-turn request identity

A Codex host may persist more than one legitimate root-user message for one
`turn_id` when the operator steers an active turn. CStar treats those messages
as one ordered root-user projection, not as an ambiguous match and not as text
to concatenate. The current MCP request must identify the latest canonical
root-user cohort. An authorization reference may independently identify an
earlier contiguous cohort in the same canonical thread. Assistant, reasoning,
tool-call, tool-output, and event rows remain non-authoritative even when Codex
stamps them with the selected `turn_id`: they never join, close, timestamp, or
invalidate a root-user cohort. A selected or later tagged row that explicitly
claims user role or `user_message` type without the canonical
`response_item`/`message`/`user` wrapper fails closed. Untagged host event
duplicates are ignored.

Two hashes serve different compatibility and integrity purposes:

- `turn_record_sha256` remains the SHA-256 of the current request cohort's
  terminal raw JSONL user record. This preserves the singleton and legacy raw
  request-record contract.
- `operator_record_sha256` is the raw-record SHA-256 of the one exact
  reference-hashed authorization row. That row may occur anywhere in its
  authorization cohort.
- `turn_record_set_sha256` / `operator_record_set_sha256` is the SHA-256 of a
  canonical, domain-separated `cstar.codex_root_user_turn_record_set.v1`
  object. It binds the thread id, turn id, physical record index, timestamp,
  and raw-record SHA-256 for every cohort member. The matching record count is
  bound separately. Records are never sorted, normalized, or deduplicated.

The authorization reference identifies exactly one consent message. Its
message digest must match the canonical `input_text` content of exactly one
record, and that record's raw hash must belong to the canonical authorization
cohort. The consent record need not be terminal or latest: benign same-turn and
later-turn steering is allowed. Other messages may establish context but are
never concatenated into or substituted for the reference-hashed consent. An
authorization turn may not reappear after a different root-user turn (`A/B/A`),
and any later revocation, stop, or contradictory Forge-lane instruction fails
closed. Once consent is matched, every later root-user record must also reduce
to canonical nonblank `input_text`; a later tagged noncanonical user-like
record also fails as uninspectable. Neither form can conceal a revocation or
qualifier.

Identity recovery reads one fixed, no-follow session file as a bounded stream.
It hashes the complete file and strictly validates every UTF-8 JSONL row, then
feeds only the current record into bounded selected-turn and revocation state
machines. It retains no raw authority-row list. Assistant, reasoning, tool, and
other non-user payloads therefore do not make memory scale with the full
long-lived session. The physical file remains capped at 512 MiB, an individual
JSONL record at 64 MiB, and the full scan at 1,000,000 rows. These resource
bounds do not weaken the selected-turn limits of 256 records and 4 MiB.

The fixed scan rejects unsafe ownership, mode, link count, type, physical or
projected size, path/descriptor drift, an unterminated final line, malformed or
non-object JSONL, duplicate selected records, record-set limits, and incomplete
content. It also requires canonical root-user session and record lineage, fresh
valid nondecreasing timestamps, and a contiguous selected cohort. The current
request cohort must remain latest; the separately recovered authorization
cohort may be historical. Fork, parent, or subagent lineage fails closed. When
request and authorization reference the same turn, their recovered record
identities must agree. When an authorization check includes current Codex
request metadata, both the latest request cohort and the historical consent and
revocation state are derived from the same descriptor scan; no second session
snapshot can race the first.

An authorized Forge request durably persists the exact authorization-row raw
hash plus the authorization cohort's ordered record-set digest and count.
`cstar_forge_execute` independently recovers all three and rejects any drift as
`forge_operator_authorization_attestation_drift` before attempt reservation,
adapter invocation, or model spend. The execute call's current request identity
is separately required to be latest, canonical, and from the same thread. This
closes accidental ambiguity and post-request authorization drift; it does not
remove the documented same-UID trust assumption. A hostile process with the
same OS identity and session-store access remains inside this design's trusted
computing base.

## Operational Mandates

1. **Host-Agent Run First.** Cognition, proposal generation, critique, and
   oracle sampling stay host-native. Kernel READ, MUTATION, REQUEST, and the
   narrowly gated Forge EXECUTION tool expose bounded primitives. A tool class,
   request shape, registry entry, or caller-supplied reference is never
   execution authority.
2. **Authority is external to capability.** Platform/operator safety, current
   explicit grants, global Corvus invariants, nearest repository policy, and
   current CStar lifecycle state govern in that order. Registries and observed
   runtime describe capability and evidence; neither may weaken a gate.
3. **Capability discovery.** `cstar_manifest` and `cstar_skill_info` are the
   canonical inventory surfaces. Spoke skills are namespaced `<slug>:<id>`.
4. **Bead anchoring.** Multi-file changes anchor to a Hall bead via `cstar_bead`. The `cstar_handoff` tool returns the active planning state for resuming work.
5. **Stateless-protocol readiness.** No tool input schema may require protocol session ids, protocol version, or client metadata. If a workflow needs continuity, return and require an explicit domain handle such as `bead_id`, `validation_id`, `spoke`, or `memory_id`; TokenPath episode ids are compatibility-only while quarantined.
6. **Routing boundary.** Load the nearest `AGENTS.md` or `AGENTS.qmd` for current
   ownership, state-repository topology, and operator gates. Do not duplicate
   mutable estate routing policy in this transport reference.
7. **Degraded MCP behavior.** If the MCP surface is unavailable or degraded, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
8. **Local identity boundary.** Direct-stdio plus session-record verification
   binds operator evidence within the trusted single-user host. It does not
   authenticate mutually hostile same-UID processes; a multi-user deployment
   requires an OS-enforced peer identity or separately authenticated transport.

## MCP 2026-07-28 Release-Candidate Readiness

The MCP `2026-07-28` release candidate removes the protocol-level `initialize`/`initialized` handshake and `Mcp-Session-Id` session model for Streamable HTTP. It also moves protocol/client metadata onto each request, introduces `server/discover`, requires routable `Mcp-Method` / `Mcp-Name` headers for HTTP, adds cache metadata (`ttlMs`, `cacheScope`) for list/read results, moves Tasks into an extension, deprecates Roots/Sampling/Logging, and lifts tool schemas to full JSON Schema 2020-12.

CStar's hardening stance:

- Keep the current stdio SDK handshake as compatibility only. It must not become an application state contract.
- Keep kernel primitives and request gates reentrant and satisfiable from the
  request arguments plus persisted Hall/kernel state. EXECUTION adapters must
  remain visibly classified and fail closed unless their explicit authorization
  and receipt contracts are satisfied.
- Use explicit CStar handles for stateful application behavior: `bead_id`,
  `validation_id`, `spoke`, `memory_id`, and similar domain ids.
  `token_path_episode_id` is compatibility-only while TokenPath is quarantined.
- Do not add Roots, Sampling, or Logging dependencies to the kernel MCP surface. Use tool parameters, host-native provider integration, stderr for stdio bootstrap diagnostics, and existing telemetry files.
- Treat Tasks and MCP Apps as future optional extensions. CStar beads already provide the canonical long-running work ledger; adopting Tasks should be a transport adapter decision, not a replacement for Hall authority.
- Keep all tool input schemas object-rooted and avoid external `$ref` dependencies. Output remains a text content envelope today, but structured output additions should be bounded and JSON Schema 2020-12 compatible.

Readiness coverage lives in `tests/features/cstar_mcp_release_candidate_readiness.feature` and `tests/integration/cstar_kernel_mcp_stdio.test.ts`.

## Response Envelope

Every tool returns an MCP content envelope:

```json
{
  "content": [
    { "type": "text", "text": "<JSON-encoded payload>" }
  ],
  "isError": false
}
```

The `text` field is always a JSON string. Parse it before consuming. On failure, `isError: true` is set and the parsed payload contains an `error` field (normalized to one line, capped at 512 chars).

Priority read surfaces include a deterministic `guardrail` object:

```json
{
  "guardrail": {
    "verdict": "allow | caution | block",
    "action": "continue | recover | repair | verify | refuse",
    "reason": "<short explanation>",
    "failed_checks": [],
    "warning_checks": []
  },
  "next_action": "<host-agent instruction>"
}
```

Priority write surfaces include a deterministic `mutation` object:

```json
{
  "mutation": {
    "kind": "<mutation family>",
    "persisted": true,
    "record_id": "<bead/memory/validation/spoke id>",
    "guardrail": { "verdict": "allow", "action": "continue", "...": "..." }
  }
}
```

`cstar_autobot` is decommissioned and absent from the supported runtime
inventory. No environment variable reactivates it. Live implementation uses
only `cstar_forge_request` followed by `cstar_forge_execute` through the sealed
private Hermes `cstar-hub`/MiniMax-M3 adapter. A model response is evidence, not
lifecycle state or validation.

---

## Tool Inventory (25)

The typed source of truth is
`src/tools/cstar-kernel-mcp/contracts/tool_catalog.ts`. Runtime registration,
host packaging, and parity tests consume that metadata directly; this table is
the reader-facing purpose projection.

| # | Tool | Tier |
|:---|:---|:---|
| 1 | `cstar_handoff` | Active state |
| 2 | `cstar_hall_search` | Discovery |
| 3 | `cstar_hall_maintenance` | Retired compatibility |
| 4 | `cstar_augury` | Routing |
| 5 | `cstar_researcher_request` | Dispatch request |
| 6 | `cstar_forge_request` | Dispatch request |
| 7 | `cstar_forge_execute` | One-shot sealed Forge execution |
| 8 | `cstar_doctor` | Diagnostics |
| 9 | `cstar_verify_plan` | Verification |
| 10 | `cstar_bead` | Bead lifecycle |
| 11 | `cstar_spoke_bead_import` | Bead lifecycle |
| 12 | `cstar_record_result` | Verification |
| 13 | `cstar_engram_record` | Memory write |
| 14 | `cstar_war_game_score` | War games |
| 15 | `cstar_manifest` | Capability discovery |
| 16 | `cstar_skill_info` | Capability discovery |
| 17 | `cstar_spoke_journal` | Spoke state |
| 18 | `cstar_pennyone_context` | Data context |
| 19 | `cstar_mongo_mailbox` | Data mailbox |
| 20 | `cstar_status` | Diagnostics |
| 21 | `cstar_evolve` | Karpathy loop (read-only) |
| 22 | `cstar_spoke` | Spoke lifecycle |
| 23 | `cstar_intent_route` | Routing |
| 24 | `cstar_warden` | Sentinel Wardens |
| 25 | `cstar_telemetry` | Diagnostics |

---

## 1. `cstar_handoff`

Compact active state from Augury/handoff logic. Returns `{ status: 'idle', guardrail, next_action }` when there is no active session.

**Input:**
- `prompt` (string, optional) — current mission prompt label for target-aware handoff checks
- `scope` (string, optional) — current mission scope label
- `target_paths` (string[], optional) — current mission targets; if they diverge from the active session, the active session is demoted to background context

**Output (active):**
```json
{
  "execution_gate": "READY",
  "status": "active",
  "authoritative": true,
  "phase": "FORGE",
  "next_action": "<imperative>",
  "guardrail": { "verdict": "allow", "action": "continue", "...": "..." },
  "lead_bead_id": "bead:...",
  "target_paths": ["<path>", "..."],
  "checker_shells": ["<command>", "..."],
  "work_items": [{ "bead_id": "...", "status": "IN_PROGRESS", "target_path": "..." }]
}
```

**Output (stale/background active session):**
```json
{
  "status": "background_active_session",
  "authoritative": false,
  "stale_session_demoted": true,
  "active_session_authority": "background",
  "guardrail": {
    "verdict": "caution",
    "action": "verify",
    "warning_checks": ["stale_session_target_divergence"]
  },
  "next_action": "Run cstar_augury with the current prompt/target_paths or create/claim a matching bead before execution.",
  "active_session_suggestion": {
    "lead_bead_id": "<stale bead>",
    "target_paths": ["<stale target>", "..."]
  }
}
```

## 2. `cstar_hall_search`

Bounded FTS5 search across `CODE / DOC / ENGRAM / BEAD / SESSION / LESSON`.

**Input:**
- `query` (string, required) — search text
- `limit` (number, optional, 1..10, default 5)
- `types` (string[], optional) — subset of `['CODE','DOC','ENGRAM','BEAD','SESSION','LESSON']`

**Output:**
```json
{
  "status": "matched | empty",
  "query": "bead",
  "count": 1,
  "result_limit": 5,
  "guardrail": { "verdict": "allow", "action": "continue", "...": "..." },
  "next_action": "<host-agent instruction>",
  "results": [{ "type": "CODE", "path_or_id": "src/main.ts", "title": "main.ts", "summary": "...", "rank": 1.0 }]
}
```

## 3. `cstar_hall_maintenance`

Fail-closed compatibility tombstone for the retired model-backed Engram lesson
study and harvest path. It never reads or writes Hall/SQLite state, invokes a
model, starts a subprocess, or projects lesson files. Use `cstar_hall_search`
with `ENGRAM` or `LESSON` filters for bounded read-only inspection.

**Input:**
- `action` ("study" | "harvest", required) — retained only so stale callers
  receive a deterministic decommission error
- `memory_id` and `limit` are accepted but ignored

**Output:** an MCP error payload with `decommissioned: true` and
`actuated: false`.

## 4. `cstar_augury`

Resolve one mission to deterministic, typed, non-authoritative routing advice,
an immutable Council critique lens, bounded Mimir targets, and explicit
TokenPath quarantine status.

**Input:**
- `prompt` (string, required) — user prompt or mission statement
- `inferred_intent` (string, optional)
- `target_paths` (string[], optional)
- `scope` (string, optional)
- `bead_id` (string, optional) — route provenance only; Augury does not write or
  link TokenPath advice

**Output (matched):**
```json
{
  "intent_category": "BUILD",
  "default_path": "cstar_forge_request",
  "expert": "carmack",
  "expert_label": "...",
  "expert_lens": "...",
  "expert_signature_question": "...",
  "expert_guardrails": ["..."],
  "actionable": false,
  "token_path": {
    "advisor": "augury-token-path",
    "status": "quarantined",
    "mode": "shadow-disabled",
    "actionable": false
  }
}
```

Augury explains route and scope; it grants no execution, spend, mutation, or
validation authority. Use it when a route or material scope is ambiguous, not
as a per-turn ritual. No numeric confidence is emitted unless an independent
scorer with a real denominator has run.

When the caller supplies a new prompt and explicit `target_paths`,
`cstar_augury` derives the current mission route from that prompt and target
set. If an active planning session exists but its Mimir targets do not overlap
the caller's targets, the active session is demoted to non-authoritative
background:

```json
{
  "intent_category": "HARDEN",
  "current_mission_route": {
    "source": "deterministic",
    "intent_category": "HARDEN",
    "selection": "WEAVE: contract_hardening",
    "target_paths": ["<caller target>", "..."]
  },
  "active_session_suggestion": {
    "authoritative": false,
    "demoted": true,
    "lead_bead_id": "<stale bead>",
    "target_paths": ["<active session target>", "..."]
  },
  "routing_provenance": {
    "source": "deterministic",
    "diverged": true,
    "active_session_authority": "background",
    "divergence": {
      "kind": "target_paths",
      "requested_target_paths": ["<caller target>", "..."],
      "session_target_paths": ["<active session target>", "..."]
    }
  }
}
```

Agents must treat `current_mission_route` as the route for the current call.
`active_session_suggestion` is historical/background context unless
`authoritative` is `true`. A fail-loud response with
`stale_session_divergence_blocker: true` is reserved for cases where Augury
cannot safely determine a current route, where active-session continuity is
explicitly requested but diverges from caller targets, or where the active
session is the only available context.

## 4b. `cstar_researcher_request` / `cstar_forge_request`

Control-plane request primitives for routing Researcher and Corvus
Forge/Hermes MiniMax work without falling back to Codex workers. These tools
validate the request contract and return compact receipts for CoS plus bounded
state-update packets. They do not run live Researcher, Forge, Hermes,
MiniMax, source adapters, browser collection, GitHub mutation, or model spend
by themselves. `cstar_forge_request` additionally persists an immutable Hall
request and binds a verified one-shot operator grant when live execution was
explicitly authorized; `cstar_researcher_request` remains a no-spend request
receipt rather than an execution surface.

**Input contract:**
- `bead_id` or `decision_id` — CStar lifecycle anchor; a decision id is generated when needed.
- `state_update_thread_id` (optional) — mapped project information-repository
  destination for a bounded context/update packet. It is used only when targets
  are inside that project and never gates execution. The deprecated
  `owner_pmt_thread_id` alias is accepted for compatibility but grants no
  ownership or review authority.
- `source_callback_thread_id` — CoS callback destination.
- `objective`, optional `prompt`, optional `target_paths`, optional `system_under_test`.
- `scope` and `authority_lane` (`green`, `yellow`, or `red`).
- `required_metrics[]` with `name` and `threshold` for each metric.
- `artifact_expectations[]` for expected report/package/evidence outputs.
- `prohibited_actions[]` and optional `requested_actions[]`; conflicts and red-gate actions are rejected.
- `spend_policy` (`no_spend`, `dry_run`, or `live_authorized`), optional live-source/retry policy.
- `callback_contract.expected_packet`.
- Optional `package_locks[]` with path/hash pairs.
- Optional `dispatch_surface_ref`; a missing or unauthorized path fails closed.

Default dispatch surfaces:

- Researcher: `.agents/skills/researcher/SKILL.md`
- Forge: `docs/operations/corvus-forge-skill-spec.md`, falling back to
  `docs/operations/corvus-forge-pipeline-playbook.md`

**Representative no-spend output posture:**

```json
{
  "status": "dry_run_no_spend",
  "dispatch_kind": "forge",
  "decision_id": "decision-forge-...",
  "receipt_id": "dispatch-forge-...",
  "bead_id": "bead-...",
  "required_metrics": [{ "name": "artifact_integrity", "threshold": "zero P1/P2" }],
  "authorized_dispatch_surface": { "found": true, "selected": { "path": "..." } },
  "dispatch_execution": {
    "attempted": false,
    "live_spend": false,
    "live_source_collection": false,
    "codex_worker_fallback_allowed": false,
    "fail_closed_reason": "no_live_dispatch_authority"
  }
}
```

If a required metric, callback packet, prohibited-action list, or dispatch
surface proof is missing, the tools return `isError: true` with
`status: "rejected"` or a fail-closed receipt. A request never proves
implementation. An authorized Forge request is durable execution authority only
for its exact sealed contract and still requires the separate atomic execute
gate; all other request receipts are no-spend routing evidence.

## 4c. `cstar_forge_execute`

Execution primitive for Corvus Forge. It is intentionally separate from
`cstar_forge_request`. No-op mode validates shape without reserving an attempt,
running Hermes/MiniMax, mutating source, collecting live data, or spending.
Live mode requires the matching durable request, a request-bound operator
attestation recovered from the authorized Codex thread/turn, an unexpired
one-shot grant, exact canonical request and target hashes, package locks, a
sealed adapter runtime, and an idempotency key. Attempt reservation is atomic;
an ambiguous or failed attempt consumes the grant and is never auto-relaunched.

Required fields include all `cstar_forge_request` contract fields plus:

- `forge_request_receipt_id` — must reference a `dispatch-forge-...` receipt.
- `forge_request_decision_id` — must match `decision_id` when `decision_id` is
  supplied.
- `forge_request_bead_id` — must match `bead_id` when both are supplied.
- `execution_mode` — `no_op` or `live_authorized`.
- `operator_authorization_ref` — required for `live_authorized` and must match
  the attestation stored with the request.
- `idempotency_key` — stable key used for atomic reservation and replay.
- Optional `execution_adapter_ref` — checked as an adapter proof; missing or
  unregistered adapters fail closed.

No-op mode returns `status: "validated_noop"` with
`forge_execution.attempted=false`, `live_spend=false`,
`live_source_collection=false`, and `codex_worker_fallback_allowed=false`.

Live mode rejects missing, expired, mismatched, or drifted authorization and
blocks when the requested adapter is unknown or its sealed runtime differs from
the request. Required outputs must be contained by explicit targets and are
included in the independently recovered operator-authorization scope before a
request is accepted. Approved adapter references are:

- `cstar-forge-hermes-minimax-adapter` — response-only; may write only the
  adapter response artifact and fails closed for build/package/source-mutation
  requests with `adapter_lacks_implementation_write_capability`.
- `cstar-forge-hermes-minimax-worker-adapter` — write-capable; asks the Hermes
  MiniMax delegate to run the fixed `bounded-six-role-manifest-v1` producer
  chain, accepts the QA role's strict exact-output file manifest, validates its
  paths against the sealed intent target roots, applies bounded project files,
  and emits the same response artifact contract.

The bounded producer order is `specifier -> coder -> cleaner -> architect ->
hardener -> QA`. Each role runs in a fresh sealed Hermes process and performs
exactly one fixed-host, non-redirecting, non-retrying MiniMax request. The
specifier sees sealed mission/materials, the coder receives the accepted
specification as its immediate handoff, and cleaner through QA receive both
that immutable specification anchor and the immediately preceding
schema-validated, SHA-256-chained mutable handoff. The provider envelope binds
role, ordinal phase, plan id/hash, input-handoff hash, and
`specification_handoff_sha256`; receipts preserve the exact ordered chain,
per-role token usage, and provider-request counts. QA alone yields the final
manifest. The role-plan digest covers canonical role order; the sealed runtime-
content digest covers policies and handoff code.

One CStar orchestration attempt contains all six role calls. Zero retries means
neither a role nor the orchestration attempt is relaunched; a role failure
stops later roles and persists bounded partial-spend evidence. This no-Git
`bounded-six-role-manifest-v1` adaptation is not the genuine upstream
SwarmForge six-pack. Upstream tmux/Git-worktree orchestration remains
separately operator-gated and must not be claimed by this runtime. Upstream
calls its fifth role `hardender`; this adaptation intentionally uses
`hardener`.

The runtime seal covers the adapter, absolute Python/Node interpreters,
Bubblewrap executable, worker safety helper, private delegate, and Hermes
lineage verifier plus `forge_role_plan.mjs`. Verified scripts are materialized
in an owner-only runtime directory; the worker runs with `-I -S -B` inside a
private Bubblewrap PID
namespace whose PID 1 exit kills all descendants. Execution traces use
contained no-follow atomic writes and are prepared before adapter start.

The no-spend request also seals a complete Hermes runtime expectation: the
canonical launcher path and digest, system-Python path/digest, exact source
closure counts/digests, bootstrap/dependency modes, and runtime root. Execute
re-resolves that expectation before reservation and compares preflight to it
before launch. Production rejects ambient `HERMES_BIN`; only the dual
synthetic-test gate permits an override. The verified preflight is retained in
prepared, started, and terminal success/failure traces. Durable adapter-version
evidence binds the Hermes runtime-content digest and terminal execution-trace
SHA-256. The terminal trace is mandatory for delivery; absence or readback
failure blocks delivery and records bounded
`trace-last:<sha256-or-unavailable>` failure evidence.

Adapter and Hermes children receive minimal allowlisted environments without
inherited secret values, and
Hermes exposes no tools under exact Forge mode: `context_engine` remains an
inert argv compatibility marker, while the Hermes-owned stdlib entrypoint loads
no generic agent, plugin, MCP, tool, or provider SDK. The Hermes launcher is
locator-only. Preflight binds root-owned system Python, dependency locks, and
the exact four-file Forge-entrypoint closure, including its sealed
`forge_minimax_oauth.py` reader.
Before reservation, that snapshot returns only a redacted `minimax-oauth`
readiness proof for the existing `cstar-hub` profile with at least 2100 seconds
of token life. CStar passes the non-secret `HERMES_HOME` profile selector but
never opens `auth.json`, receives a token, or authorizes refresh. Missing,
unsafe, expired, insufficient-scope, or refresh-required state fails without
reserving an attempt. The prepared invocation repeats the check and requires
the same proof. Existing durable idempotency-key replays bypass freshness
probing because they perform no new reservation or provider call. Live mode requires that bound
proof and launches an owner-private snapshot made from the same verified bytes
with isolated `-I -S -B`, no site-packages, and a fresh empty
`sys.pycache_prefix`; original `.pyc`, `.pth`, and site customization are not
executable. Exactly one fixed-host MiniMax HTTPS request is allowed per role
process, and the request receipt, execute receipt, decision, adapter, runtime
digest, role/phase/plan/handoff identity, reported model, and usage are
validated in the private response envelope.
Caught exceptions restore file bytes/modes and remove adapter-created files and
directories. Multi-file crash recovery remains inspection-required because the
worker has no durable write-ahead journal.

Operators must not substitute `cstar_autobot`, Codex workers, direct Hermes, or
ad hoc shell execution for this gate. The private write-capable adapter invokes
Hermes through its `cstar-hub` profile pinned to `minimax-oauth/MiniMax-M3`; receipts
record requested and actual model identity separately and do not infer the
actual model when the provider omits it. For live adapter execution, the model response is persisted
under `work/forge-executions/<execution_receipt_id>/adapter-response.json` and
the receipt reports the response artifact path, byte count, and sha256 so
review does not depend on transient stdout. The persisted adapter response must
match the Forge execution packet shape: `status`, `summary`, `files_changed`
array, structured `artifacts`, structured `validation`, structured `metrics`,
structured `boundaries`, and optional `callback_packet`. Success-like statuses
must not claim missing changed files or artifact paths; missing path evidence
fails closed as `adapter_degraded`. Advisory-only packets, including the legacy
label `PASS-READY-FOR-PMT-REVIEW`, fail closed when required evidence is absent
and never grant review or acceptance authority.

A structurally valid packet is persisted as `delivered_unverified`; it is not
success. Independent, hash-verified evidence must be recorded with
`cstar_record_result`. Positive verified evidence finalizes the attempt as
`SUCCEEDED`; negative verified evidence finalizes it as `FAILED_FINAL`.
Validation persistence and Forge finalization are one transaction, so neither
state change survives alone.

## 5. `cstar_doctor`

Kernel diagnostics. Returns registry / Augury / database health plus telemetry
summary. `score` is a legacy diagnostic projection only; it is not a quality,
readiness, execution, or authority verdict. The TokenPath block reports
quarantine/compatibility telemetry and cannot steer or record observations.

**Input:** _(none)_

**Output:**
```json
{
  "status": "healthy" | "degraded" | "fail",
  "score": 0.0,
  "warnings": ["..."],
  "active": true,
  "checks": { "database": true, "registry": true, "augury": true },
  "telemetry": { "...": "..." },
  "usefulness": { "...": "..." },
  "token_path": { "advisor_available": true, "...": "..." }
}
```

## 6. `cstar_verify_plan`

Recommended checker shells and the last validation verdict for the active bead.

**Input:** _(none)_

**Output:**
```json
{
  "recommended_commands": ["<command>", "..."],
  "status": "ready | empty",
  "reason": "...",
  "bead_id": "bead:...",
  "target_paths": ["..."],
  "last_validation": { "verdict": "SUCCESS", "recorded_at": 1700000000000, "validation_id": "val-..." },
  "guardrail": { "verdict": "allow", "action": "verify", "...": "..." },
  "next_action": "<host-agent instruction>"
}
```

## 7. `cstar_bead`

Bead lifecycle: `get` / `list` / `create` / `update_status` / `claim` / `resolve` / `block`.

**Input (selected):**
- `action` (enum, required)
- `bead_id` (string, optional — required for non-list operations)
- `rationale`, `acceptance_criteria`, `checker_shell` (strings, required for create)
- `target_kind` (enum: `FILE|SECTOR|REPOSITORY|CONTRACT|SPOKE|WORKFLOW|VALIDATION|OTHER`)
- `target_path`, `target_ref` (strings, optional)
- `status` (enum: `OPEN|SET-PENDING|SET|IN_PROGRESS|READY_FOR_REVIEW|NEEDS_TRIAGE|BLOCKED|RESOLVED|ARCHIVED|SUPERSEDED`)
- `statuses` (enum[], optional) — filter for list
- `assigned_agent`, `resolution_note`, `triage_reason`, `resolved_validation_id`, `validation_id`, `contract_refs`, `metadata`
- `spoke` (string, optional) — anchor the bead to a registered spoke's repo_id

`resolved_validation_id` is the canonical output/readback field for resolved beads.
`validation_id` is accepted as a short input alias on `resolve` and
`update_status` with `status=RESOLVED`; `mandate_evidence.audit.validation_id`
is also accepted as the resolution id fallback. Resolved ids are persisted both
in the Hall column and in bead metadata so a later readback can verify the
timeline even if one storage surface is stale.

Sterling's Audit leg accepts only evidence already bound to the bead and
repository by an authoritative Hall receipt:

- `audit.validation_id` must resolve to an `ACCEPTED` or `SUCCESS` validation
  with `authority_class=verified`, a validator identity, and a valid evidence
  SHA-256.
- Each `audit.warden_results[]` entry must reference such a receipt and exactly
  match its validator identity, evidence digest, timestamp, and normalized
  verdict while declaring `independent_of_execution=true`.
- Caller-supplied scalar `gungnir_score` values are rejected. Historical Hall
  Gungnir/baseline metric fields remain compatibility telemetry and do not
  authorize bead resolution.

**Output:** `{ status: 'created'|'claimed'|'resolved'|'blocked'|'updated'|'ok', mutation, bead: {...} }` or `{ status: 'ok', count, beads: [...] }` for list.

## 8. `cstar_spoke_bead_import`

Rich Bead-import surface for spokes. Hard-rejects unregistered, inactive, quarantined, or read-only spokes.

**Input (selected required):**
- `spoke` (string) — registered spoke slug
- `intent`, `acceptance_criteria` (strings)
- `lore_path` (string) — Gherkin .feature file, must exist on disk

**Optional:** `bead_id`, `design_doc_path`, `wireframe_ref`, `threat_model_summary`, `contract_refs`, `checker_shell`, `target_paths`, `target_kind`, `target_ref`, `augury_block`, `assigned_agent`, `status`, `metadata`.

**Output:** `{ status: 'created', action: 'spoke_bead_import', mutation, spoke, repo_id, bead }`.

## 9. `cstar_record_result`

Record validation against a repository-local bead and optionally finalize a
delivered Forge attempt. Positive reported verdicts without hash-verified,
independent evidence are stored as `INCONCLUSIVE` rather than authoritative.

**Input:**
- `bead_id` (string, required)
- `verdict` (enum: `ACCEPTED|REJECTED|INCONCLUSIVE|SUCCESS|FAILURE`, required)
- `notes` (string, optional)
- `validation_id` (string, optional) — caller-stable validation identity
- `forge_execution_receipt_id` (string, optional) — transactionally finalizes
  the matching delivered attempt
- `validation_evidence` (object, optional) — independent validator identity plus
  bounded artifact paths and SHA-256 hashes
- `token_path_episode_id` / `token_path_observation` (optional compatibility
  fields) — quarantined and never promoted while TokenPath is disabled

Validation persistence and Forge finalization are one transaction. If either
side fails, the validation row is rolled back and the response reports
`validation_persisted: false`, `validation_authority: "not_persisted"`, and no
stored verdict. TokenPath does not auto-link advice and performs no write.

**Output:** `{ status, mutation?, bead_id, reported_verdict, stored_verdict, validation_id, validation_persisted, validation_authority, authoritative, forge_validation?, token_path_observation_status }`.

**Observation statuses:**
- `recorded` — reserved for a future promoted, causally linked TokenPath
  pipeline; it is unreachable while quarantine is active.
- `not_recorded` — current expected state; inspect
  `token_path_observation_warning` for quarantine or malformed input.

The current valid-measurement warning is
`token_path_quarantined_no_promoted_episode`.

## 10. `cstar_engram_record`

Publish an Engram to the Hall. Spokes use this as the dead-drop write surface for cross-system events. Fires `cstar_war_game_score` if intent matches a registered contest defender prefix.

**Input:**
- `intent` (string, required)
- `bead_id` (string, required)
- `spoke` (string, optional) — must be active/trusted/read_write
- `metadata` (object, optional)
- `memory_id` (string, optional)

**Output:** `{ status: 'recorded', mutation, memory_id, intent, bead_id, repo_id, score_results? }`.

## 11. `cstar_war_game_score`

War-game scoring. Actions: `register_contest`, `tally`, `recent`, `by_scenario`, `get_score`, `list_contests`. Scoring fires automatically when `cstar_engram_record` receives an Engram whose intent matches a registered contest defender prefix.

**Input:** `action` (enum), plus action-specific fields (see `tests/integration/war_game_scoring.test.ts` for full examples).

`register_contest` returns `{ status: 'registered', contest_id, mutation }`. Read actions return query envelopes without `mutation`.

## 12. `cstar_manifest`

Capability discovery. Hub registry merged with spoke-local manifests, namespaced `<slug>:<id>`. Read-only; announce-only per BEAD-CSTAR-SPOKE-DISCOVERY-001.

**Input:**
- `scope` ("hub" | "spoke" | "all", optional, default "hub")
- `spoke` (string, optional) — narrows spoke walk when scope is spoke/all

## 13. `cstar_skill_info`

Per-capability contract. Resolves `<slug>:<id>` to spoke SKILL.md + invocation metadata; bare ids go to the kernel registry.

**Input:**
- `id` (string, required)
- `spoke` (string, optional) — override parsed slug

## 14. `cstar_spoke_journal`

Four-file journal state for a registered spoke: `memory.md`, `tasks.md`, `wireframe.md`, `DEV_JOURNAL.md`. Reports presence, mtime, sha256, size_bytes, summary. Memory-file drift between `.agent/` and `.agents/` is flagged.

**Input:**
- `spoke` (string, required)

## 15. `cstar_pennyone_context`

Bounded read-only context from PennyOne/Hall. This is the supported MCP path
for project memory summaries and repository/bead/validation context. It does
not accept SQL, table names, or arbitrary database filters from the caller.

**Input:**
- `action` (`status` | `bead_summary` | `validation_summary` | `repository_summary`, required)
- `limit` (number, optional, 1..50, default 10 for bounded list actions)
- `statuses` (string[], optional) — bead status filter for `bead_summary`
- `bead_id` (string, optional) — required to return validation rows in `validation_summary`
- `spoke` (string, optional) — optional repository summary filter

**Output posture:**
```json
{
  "status": "ok",
  "source": "pennyone-hall",
  "action": "bead_summary",
  "guardrail": { "verdict": "allow", "action": "continue", "...": "..." },
  "next_action": "Use this bounded context to choose the next CStar bead action.",
  "count": 3,
  "beads": [{ "bead_id": "bead-...", "status": "OPEN", "title": "..." }]
}
```

Use this tool before asking for broad database exports. If the requested view
does not fit one of the named actions, add a new named action with its own
schema, tests, and operator-facing documentation instead of adding raw query
passthrough.

## 16. `cstar_mongo_mailbox`

Bounded Mongo-backed mailbox/cache surface for external mirrors and operator
intent queues. Mongo is not a source of truth for CStar lifecycle state; it is a
transport/mirror layer that can help dashboards and host processes exchange
state with PennyOne/Hall. The tool fails closed when Mongo is not configured or
when the optional `mongodb` driver is unavailable.

**Input:**
- `action` (`status` | `mirror_counts` | `enqueue_operator_intent`, required)
- `operator_authorization_ref` (string, required for `enqueue_operator_intent`)
- `intent_action` (`accept` | `decline` | `refine` | `dispatch` | `edit`, required for `enqueue_operator_intent`)
- `proposal_id` (string, required for `enqueue_operator_intent`)
- `payload` (object or null, optional)
- `actor` (string, optional; defaults to `cstar-kernel-mcp`)

**Output posture:**
```json
{
  "status": "disabled" | "ok" | "queued",
  "source": "mongo-mailbox",
  "guardrail": { "verdict": "caution", "action": "recover", "...": "..." },
  "next_action": "Configure CSTAR_MONGO_URI only when a mailbox mirror is required."
}
```

`enqueue_operator_intent` is runtime fail-closed with
`durable_operator_intent_authority_not_implemented`. A caller-supplied
authorization string is evidence, not authority. Only read-only status and
bounded mirror counts are available until both producer and consumer verify the
same durable request-bound grant with replay protection. Never insert directly
into Mongo to bypass this boundary.

## 17. `cstar_status`

Deterministic current-state snapshot. CStar lifecycle state is separated from
the legacy framework projection; persona is explicitly style-only.

**Input:** _(none)_

**Output:**
```json
{
  "framework": { "authority": "compatibility_projection", "status": "AWAKE", "active_persona": "A.L.F.R.E.D.", "process_uptime_seconds": 0, "baseline_gungnir_score": 0 },
  "current_mission": { "authority": "cstar_lifecycle", "current_bead_id": "bead-...", "target_paths": ["..."] },
  "persona": { "name": "A.L.F.R.E.D.", "authority": "style_only" },
  "workspace": "/abs/path",
  "hall_reachable": true,
  "managed_spokes": [{ "slug": "...", "mount_status": "active", "trust_level": "trusted", "write_policy": "read_write", "root_path": "..." }],
  "agents": [{ "id": "gemini", "name": "Gemini", "status": "SLEEPING", "last_seen": null }]
}
```

`baseline_gungnir_score` and other compatibility fields are historical
telemetry, not measured validation, confidence, or readiness evidence.

## 18. `cstar_evolve`

Read-only inspection of evolve proposals and SPRT history. Proposal generation and adversarial critique are LLM-driven and stay host-native (not exposed here).

**Input:**
- `action` ("list_proposals" | "get_proposal" | "list_sprt_history", required)
- `proposal_id` (string, required for get_proposal; must match `[a-zA-Z0-9._-]+`, no path components)
- `limit` (number, optional, 1..100)

**Path-traversal guard:** `proposal_id` is rejected if it contains `/`, `\`, or `..`. Maximum proposal size: 512 KB.

## 19. `cstar_spoke`

Mounted-spoke lifecycle. Completes the spoke surface alongside `cstar_spoke_journal` and `cstar_spoke_bead_import`.

**Input:**
- `action` ("list" | "link" | "unlink" | "inspect" | "project" | "doctor" | "prune" | "verify" | "health", required)
- `slug` (string, required for link/unlink/inspect/project/verify/health; normalized to `[a-z0-9._-]+`, 1..64 chars)
- `root_path` (string, required for link) — absolute or relative
- `kind` ("local"|"git"|"mirror"|"archive", optional, default "local")
- `remote_url`, `branch`, `trust_level`, `write_policy` (optional, link only)
- `accept_beads` (boolean, optional) — shortcut: forces trust=trusted, write_policy=read_write

**Output (link):** `{ status: 'linked'|'relinked', mutation, slug, root_path, trust_level, write_policy, created_at }`. Re-linking an existing slug preserves `created_at` and merges existing metadata. `unlink` and `project` also include `mutation`; list/inspect/doctor/verify/health stay read-only.

Mounted-spoke records are hub-scoped. The stored `repo_id` identifies the CStar
hub repository that owns the mounted-spoke row, not the mounted spoke's own git
repository. `list` and `inspect` expose `hub_repo_id`, `spoke_repo_id`, and
`repo_id_semantics` so callers can distinguish hub ownership from the spoke
root identity. `project` refreshes projection metadata and the spoke
`default_branch` from git metadata where available.

## 20. `cstar_intent_route`

Resolve a prompt against the kernel intent grammar (`.agents/skill_registry.json#intent_grammar`).

**Input:**
- `prompt` (string, required; 1..4096 chars)
- `action` ("match" | "explain", optional, default "match")
  - `match` → first winning category
  - `explain` → every category whose triggers intersect the tokens

**Output (match):**
```json
{
  "status": "matched" | "unmatched",
  "grammar_source": "registry" | "fallback",
  "guardrail": { "verdict": "allow", "action": "continue", "...": "..." },
  "next_action": "<host-agent instruction>",
  "intent_category": "BUILD",
  "default_path": "cstar_forge_request",
  "tier": "SKILL",
  "matched_trigger": "build"
}
```

**Output (explain):**
```json
{
  "status": "matched" | "unmatched",
  "grammar_source": "registry" | "fallback",
  "guardrail": { "verdict": "allow", "action": "continue", "...": "..." },
  "next_action": "<host-agent instruction>",
  "match_count": 2,
  "matches": [
    { "intent_category": "BUILD", "default_path": "cstar_forge_request", "tier": "SKILL", "matched_triggers": ["build"] },
    { "intent_category": "OBSERVE", "default_path": "cstar_status", "tier": "PRIME", "matched_triggers": ["status"] }
  ]
}
```

`grammar_source: "fallback"` means the registry failed to load and the in-code defaults from `src/node/core/runtime/host_workflows/chant_parser.ts#INTENT_CATEGORIES` were used.

## 21. `cstar_warden`

Sentinel Wardens on demand. Python-side scanners are deterministic (AST/text). Driver: `scripts/run_warden.py`.

**Input:**
- `action` ("list" | "bounties" | "scan", required)
- `warden` (string, required for scan; must match `[a-z0-9_]+`, 1..64 chars)
- `target` (string, optional for scan) — path inside the project root. Directory targets become the warden's effective root (constraining scan scope). File targets are surfaced as advisory metadata.

**Output (list):**
```json
{
  "status": "ok",
  "source": "driver" | "fallback",
  "count": 12,
  "wardens": [{ "slug": "norn", "module": "src.core.engine.wardens.norn", "class": "NornWarden" }]
}
```

**Output (scan):** Envelope includes `status`, `warden`, `root_used`, `exit_code`, plus driver fields. `status` will be one of: `ok` / `unknown_warden` / `import_failed` / `dependency_missing` / `scan_failed` / `invalid_root`. The `dependency_missing` envelope includes `missing_module` so hosts can decide whether to install or skip.

**Output (bounties):** Reads `.agents/tech_debt_ledger.json` (cached PennyOne sweep).

## 22. `cstar_telemetry`

Read-only MCP telemetry summaries over the last 24h. Source: `.agents/state/cstar-kernel-mcp-*.jsonl`.

**Input:**
- `section` ("all" | "usage" | "usefulness" | "token_path", optional, default "all")

**Output:**
```json
{
  "status": "ok",
  "section": "all",
  "workspace": "/abs/path",
  "generated_at": "2026-05-14T12:34:56.000Z",
  "usage": { "total_calls_24h": 0, "failures_24h": 0, "tool_counts_24h": {} },
  "usefulness": { "total_calls_24h": 0, "search_hit_rate": null, "augury_routed_rate": null, "validations_recorded_24h": 0, "usefulness_warnings": [] },
  "token_path": { "advisor_available": false, "advice_count_24h": 0 },
  "guardrail": { "verdict": "allow", "action": "continue", "...": "..." },
  "next_action": "Use telemetry warnings to pick the next hardening target."
}
```

---

## Invocation Examples

### From an MCP-aware host (Claude / Gemini / Codex)
Invoke directly via the MCP protocol — the host's tool-call mechanism wraps the JSON-RPC frames automatically. The tools above are listed under the `cstar-kernel` server.

### From a raw JSON-RPC client
With the current stdio SDK transport, the raw client still performs the SDK compatibility `initialize` + `notifications/initialized` handshake:

```jsonc
// Request
{ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "cstar_status", "arguments": {} } }

// Response
{ "jsonrpc": "2.0", "id": 2, "result": {
    "content": [{ "type": "text", "text": "{\"framework\":{...},\"hall_reachable\":true,...}" }]
  } }
```

Example end-to-end test: `tests/integration/cstar_kernel_mcp_stdio.test.ts`.

That handshake is not a CStar application session. Future Streamable HTTP adapters targeting MCP `2026-07-28` should route equivalent calls as self-contained requests carrying protocol/client metadata in request `_meta` and, where applicable, HTTP routing headers. The CStar tool arguments themselves must remain explicit-handle based.

## Adding a New Tool

1. Add the handler to a focused module under `src/tools/cstar-kernel-mcp/tools/` or a narrower domain folder. Do not add behavior to the root `src/tools/cstar-kernel-mcp.ts` entrypoint.
2. Add or reuse a Zod schema in `src/tools/cstar-kernel-mcp/contracts/` when the schema is shared; otherwise keep the schema beside the registration code.
3. Add the tool's `{ name, toolClass, description }` metadata to `CSTAR_KERNEL_TOOL_CATALOG` in `src/tools/cstar-kernel-mcp/contracts/tool_catalog.ts`.
4. Register its explicit schema and handler through the catalog-backed helper in `src/tools/cstar-kernel-mcp/register_core_tools.ts`; do not repeat its name, class, or description outside the catalog.
5. Re-export the handler from `src/tools/cstar-kernel-mcp.ts` only when tests or host-facing code need a direct import.
6. Regenerate and validate host distributions; packaging derives its inventory from the catalog.
7. Add an entry to this reader-facing table in tool-number order.
8. Add focused unit tests under `tests/unit/cstar-kernel-mcp/`, then import them from `tests/unit/test_cstar_kernel_mcp.test.ts` so legacy checker commands still run the full suite. The stdio integration test already compares launched-runtime metadata with the catalog.
9. Confirm the new input schema is object-rooted and does not introduce protocol/session/client metadata as tool arguments.
10. Keep every production MCP file and focused test file under 500 lines; `tests/unit/cstar-kernel-mcp/test_file_size_contract.test.ts` enforces this.
11. Run the focused unit suite, stdio integration suite, `node --check bin/cstar-kernel-mcp.js`, and `git diff --check` before committing.

## What Does Not Belong on This Surface

- **Ungated LLM inference per iteration** — bounded proposal generation and
  critique stay in the active host when current policy calls for them; generic
  oracle sampling and autonomous mutation are not alternate execution lanes. A separately
  classified EXECUTION adapter may invoke an external model only after its
  durable request and request-bound operator approval are verified. Adapter
  delivery still requires independent validation before success.
- **Retired compatibility flows** — `ravens`, One Mind, model-memory workflows,
  and autonomous `start` behavior remain retired even if legacy CLI names or
  read-only status projections still parse. Explicit operator-gated setup or OS
  maintenance commands are separate terminal operations, not skills.
- **Generic skill dispatch** — a `run_skill` tool would violate the Host-Native Skill Mandate. Use per-skill MCP tools or host-native `SKILL.md` execution.
