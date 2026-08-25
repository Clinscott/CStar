# cstar-kernel MCP — API Reference

> The authoritative kernel surface for Corvus Star. Forge is
> `TOMBSTONED_PERMANENT`. Its four former public names are absent from the MCP
> inventory and cannot create requests, grant authority, dispatch work, replay
> work, record completion, or mutate state. Current implementation uses
> `cstar_mission`, deterministic effect reservation, a native task-control work
> cell, a typed terminal packet, and hash-bound host-native independent
> validation through `cstar_record_result`. Historical Forge contracts and
> receipts below are immutable forensic reference only. They are not a current
> route, compatibility lane, fallback, or activation mechanism.
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
`src/tools/cstar-kernel-mcp.ts`, relays stdin, inherits stdout/stderr, and exits
with the child status. It retains a small launcher parent so the child receives an exact
allowlisted, host-neutral environment before startup. The launcher never
copies the parent environment wholesale, never forwards `NODE_OPTIONS`,
provider credentials, Mongo URIs, persona values, or TokenPath roots, and the
TypeScript entrypoint never loads a project `.env`. The MCP child keeps stdin
open and exits cleanly when its transport closes. The full boundary and
allowlist rationale are in
`docs/operations/cstar-kernel-secret-environment-boundary.md`.

Executable lineage and canonical state are separate. `CODE_ROOT` supplies
source, registries, dispatch contracts, and adapters; `CONTROL_ROOT` supplies
Hall, lifecycle state, telemetry, logs, receipts, and estate target
containment. `cstar_status` and `cstar_doctor` report both roots and hashes.
Kernel root health and host-work-cell readiness are separate. Current work
requires a real code-root dependency tree matching the checked-in lock. Forge
readiness is always false. Historical Forge and private-runtime manifests are
reported only as non-actionable evidence. See
`docs/operations/cstar-kernel-code-control-root-boundary.md`.

The historical `cstar.kernel_runtime_lineage.v2` Forge proof is retained for
forensics, but its actionable verdict is permanently false. Its former checks
required
the supported live launcher, distinct code/control roots, synchronized
`package.json` root metadata and `package-lock.json`, a regular non-symlinked
`node_modules`, a matching installed hidden lock, and matching installed
package versions. Platform-incompatible optional packages are the only allowed
lock omissions. Kernel-critical generated native artifacts are a separate
fail-closed proof: the required `better-sqlite3` binding must be a contained,
single-link, current-platform binary, and its bytes are hashed into the stable
pre-spend binding. A sterile, bounded child must also open an in-memory database,
execute `SELECT 1`, and close it successfully. A scripts-disabled install cannot
satisfy that proof by metadata or a fabricated binary header alone. This remains
bounded dependency metadata/inventory and required
artifact proof, not a claim that every dependency byte was content-attested.
The private-runtime verdict also
validates the exact manifest contract and hashes its launcher plus all five
declared source files; manifest/launcher presence alone is insufficient.

For Codex Desktop-on-WSL,
`/home/morderith/.codex/bin/wsl/cstar-kernel-mcp-wrapper` launches the direct
source stdio lineage through `bin/cstar-kernel-mcp.js`.
`bin/cstar-kernel-mcp-bridge.js` and
`scripts/cstar-mcp-tcp-daemon.js` are import-safe retirement tombstones. They
return `legacy_cstar_mcp_tcp_transport_retired_use_direct_stdio` before socket,
process, or fallback activity. No CStar TCP listener is an authorized fallback.

Direct-stdio operator attestation is a local single-user trust boundary. The
kernel binds an authorization reference to the current thread id and verifies
the referenced Codex session record and message hash, but it cannot establish a
cryptographic identity boundary against another process running as the same OS
user with access to that session store. CStar therefore assumes same-UID local
processes are inside the operator's trusted computing base. Do not use this
attestation design as a multi-user or hostile-local-process security boundary.

### Codex steered-turn request identity

The historical-cohort rules in this subsection apply to generic CStar request
identity and legacy evidence only. They do not authorize Forge spend. Forge v3
uses the stricter singleton operator-intent protocol documented under
`cstar_forge_authorize`: current/latest root-user turn, one user record, bounded
canonical `input_text`, an exact durable work reference, and no steering.
Preserved v2 compatibility alone retains an internal exact-challenge protocol.

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

Codex may also serialize two reserved non-authority companions. A complete
`<codex_internal_context source="goal">...</codex_internal_context>` record is
always projected out: even a user-authored exact lookalike cannot grant
authority, while malformed, extended, oversized, other-source, or non-root
records remain fail-closed evidence. An adjacent `event_msg/user_message` is
projected out only when it repeats the immediately preceding canonical user
text, has finite nondecreasing time within one second, contains empty image and
text-element arrays, and has no unknown payload fields. Any near miss remains a
noncanonical user-like barrier.

Codex 0.144.4 may also serialize one host-generated platform context with the
same `response_item`/`message`/`user` wrapper as the operator input. CStar
projects that companion out of authority only after proving the complete,
contiguous, same-turn host envelope `platform context -> world_state ->
turn_context -> operator input` with finite nondecreasing timestamps inside a
one-second window. The candidate must be one pure `<environment_context>`
`input_text`; the final operator record remains authoritative regardless of its
text. Missing, reordered, interleaved, oversized, mismatched-turn, incomplete,
or stale envelopes are replayed unchanged and therefore fail closed under the
normal cohort rules. The fixed scan's physical row count and full-file digest
still include the projected host record.

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

One Forge authorization durably persists the singleton authorization-row hash,
its record-set digest/count, request and requester lineage, a bounded intent
projection, request hash, thread, turn, expiry, and one-request-per-turn binding.
Legacy exact-profile receipts additionally retain their challenge hash. A new
`cstar_forge_execute` reservation independently recovers that same current turn
before preflight and again immediately before reservation. Any drift fails before
attempt creation or model spend. Existing-attempt replay is read-only and may be
retrieved from a later canonical root-user turn by the same idempotency key. This
closes accidental ambiguity and mid-preflight steering drift; it does not remove
the documented same-UID trust assumption.

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
3. **Capability discovery.** `cstar_manifest` is the default operator catalog
   and omits hub entries whose resolved `entry_surface` is `compatibility`.
   `cstar_skill_info` remains the explicit exact-id lookup for hub compatibility
   entries as well as active capabilities. Spoke skills are namespaced
   `<slug>:<id>`.
4. **Bead anchoring.** Multi-file changes anchor to a Hall bead via `cstar_bead`. The `cstar_handoff` tool returns the active planning state for resuming work.
5. **Stateless-protocol readiness.** No tool input schema may require protocol session ids, protocol version, or client metadata. If a workflow needs continuity, return and require an explicit domain handle such as `bead_id`, `validation_id`, `spoke`, `memory_id`, or the immutable event returned by `cstar_goal_resume`. TokenPath is not a public continuity handle while quarantined.
6. **Routing boundary.** Load the nearest `AGENTS.md` or `AGENTS.qmd` for current
   ownership, state-repository topology, and operator gates. Do not duplicate
   mutable estate routing policy in this transport reference.
7. **Degraded MCP behavior.** If the MCP surface is unavailable or degraded, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
8. **Local identity boundary.** Direct-stdio plus session-record verification
   binds operator evidence within the trusted single-user host. It does not
   authenticate mutually hostile same-UID processes; a multi-user deployment
   requires an OS-enforced peer identity or separately authenticated transport.

### Historical Codex-host Forge handoff (forensic reference only)

The retired state-only handoff for Codex-hosted Forge work recorded
`runner_owner: "codex-host"`, requested model `gpt-5.6-luna`, requested
reasoning `max`, and `selector_status: "enforced"` when the host exposes that
selector. Requested identity and host-reported actual identity are separate
fields; actual identity is `unreported` when the host does not expose it. This
is a handoff description only. It makes no runtime activation,
provider-readiness, credential, or completed-attempt claim.

After CStar returns `host_handoff_queued` or `host_handoff_replayed`, the active
Codex host owns a separate post-return consumption boundary. It must retain the
exact returned `handoff_path`, `handoff_sha256`, request id/hash, execution
receipt id, attempt id, and `target_paths_sha256`, then invoke
`npm run consume:forge-host-handoff -- --handoff-path <path> --handoff-sha256
<hash> --request-id <id> --request-sha256 <hash> --execution-receipt-id <id>
--attempt-id <id> --scope-sha256 <hash>`. The command opens the exact durable
file with no-follow descriptor checks, rejects unsafe type/link-count/owner/mode
or schema/hash/job/request/attempt/scope drift, and calls the existing bound
target/output identity check immediately before returning
`ready_for_host_execution`. A replay projection does not require the on-disk
status to change from `queued`; the trusted returned bindings are authoritative
for this read.

This host-local consumption receipt is evidence of a final sequential
filesystem check only. It is not a CStar lifecycle transition, a validation
ticket consumption, Forge finalization, provider/cognition launch, or authority
grant. The no-follow descriptor and final identity check narrow replacement risk
but cannot provide filesystem-wide atomicity across the final check and later
host opens/execution; that sequential TOCTOU boundary remains explicit. Missing,
malformed, unsafe, or drifted input returns no executable job and is not deleted
or quarantined by the runtime consumer.

Independent validation uses a one-use validator ticket bound to the exact Forge
execution and validator identity. `cstar_record_result` consumes the ticket once;
replay is rejected. This documents the validation boundary and does not claim
that a ticket has been issued, consumed, or activated in a live run.

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

The `text` field is always a JSON string. Parse it before consuming. On
failure, `isError: true` is set and the parsed payload contains a stable
machine-readable `error_code` plus a compatibility `error` field normalized to
one line and capped at 512 chars. Callers must branch on `error_code`, never on
human error prefixes.

Forge request, authorization, and execution handlers mark responses that have
not crossed their exact authority boundary with a kernel-private disposition.
Instrumentation recognizes only that unforgeable in-memory disposition; an
attacker-controlled `error` or `error_code` string cannot suppress telemetry.
Preauthorization responses remain machine-readable to the caller but create no
usage/usefulness JSONL, Hall, or SQLite state. Forge authorization first proves
the current root-user identity. It may then read one bounded receipt to
recompute a v2 compatibility manifest, but it masks every preauthorization
receipt or runtime distinction as `forge_operator_authorization_required` and
verifies one exact work-referenced root-user instruction before writable Hall
access. Preserved v2 requests may instead verify their internal exact challenge.
Live execution masks all
receipt or authorization distinctions as
`forge_execution_authorization_required` until the current authorizing turn is
proven. The sole exception is identity-gated, no-spend retrieval of an already
durable attempt after the stored authorization receipt, immutable request
lineage, supplied authorization reference, and idempotency key all match; that
replay is also non-recordable and cannot reserve or invoke anything. After the
authority boundary, ordinary failures remain eligible for
bounded telemetry, which never stores raw errors, paths, stacks, challenges, or
authorization material.

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
inventory. No environment variable reactivates it. The legacy private v2 Forge
adapter is an explicitly authorized Forge execute lane: sealed private Hermes
`cstar-hub`/MiniMax-M3 owns its provider and network boundary. The current
Codex-host state-only Luna handoff is separate: CStar persists the host
job/request handoff and bounded continuity receipts, records the requested
selector and reasoning separately from host-attested actual identity, and
performs zero provider calls, network requests, spend, or Luna execution in
CStar. A host-job receipt is evidence only; it is not provider execution, Forge
authorization, validation, or lifecycle success. A model response is evidence,
not lifecycle state or validation.

---

## Tool Inventory (28)

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
| 6 | `cstar_doctor` | Diagnostics |
| 7 | `cstar_verify_plan` | Verification |
| 8 | `cstar_bead` | Bead lifecycle |
| 9 | `cstar_goal_resume` | Host-goal continuity evidence |
| 10 | `cstar_spoke_bead_import` | Bead lifecycle |
| 11 | `cstar_record_result` | Verification |
| 12 | `cstar_engram_record` | Memory write |
| 13 | `cstar_war_game_score` | War games |
| 14 | `cstar_manifest` | Capability discovery |
| 15 | `cstar_skill_info` | Capability discovery |
| 16 | `cstar_spoke_journal` | Spoke state |
| 17 | `cstar_pennyone_context` | Data context |
| 18 | `cstar_mongo_mailbox` | Retired compatibility |
| 19 | `cstar_status` | Diagnostics |
| 20 | `cstar_persona_set` | Explicit workflow posture |
| 21 | `cstar_evolve` | Karpathy loop (read-only) |
| 22 | `cstar_spoke` | Spoke lifecycle |
| 23 | `cstar_intent_route` | Routing |
| 24 | `cstar_warden` | Sentinel Wardens |
| 25 | `cstar_telemetry` | Diagnostics |
| 26 | `cstar_mission` | Bounded host-native mission request |

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
  "phase": "EXECUTION",
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
`actuated: false`, using the stable failure
`legacy_hall_maintenance_retired_use_bounded_hall_search`.

## 4. `cstar_augury`

Resolve one mission to deterministic, typed, non-authoritative routing advice,
an immutable Council critique lens, bounded Mimir targets, and explicit
TokenPath quarantine status.

**Input:**
- `prompt` (string, required) — user prompt or mission statement
- `inferred_intent` (string, optional)
- `target_paths` (string[], optional)
- `scope` (string, optional)
- `bead_id` (string, optional) — accepted for compatibility only; TokenPath
  neither reads it nor writes or links advice

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
    "schema_version": "1.0.0",
    "status": "quarantined",
    "actionable": false,
    "advisor_available": false,
    "advice_attached": false,
    "advice_writes_enabled": false,
    "observation_writes_enabled": false,
    "external_root_consulted": false,
    "reason": "token_path_independent_promotion_required"
  }
}
```

Augury explains route and scope; it grants no execution, spend, mutation, or
validation authority. Use it when a route or material scope is ambiguous, not
as a per-turn ritual. No numeric confidence is emitted unless an independent
scorer with a real denominator has run.

While quarantine is active, this TokenPath block is a static status envelope,
not advice. `cstar_augury` does not read `AUGURY_TOKEN_PATH_ROOT`, probe an
external TokenPath repository, dynamically import an advisor, choose a policy,
create an episode, or append advice. A hostile environment override is inert.
The compatibility advice and observation append entrypoints return `null`
without a project write, temporary fallback, or success receipt.

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

`cstar_researcher_request` remains active. `cstar_forge_request` is absent from
the public MCP inventory. The Forge contract text in this subsection is
forensic reference only and cannot authorize or route current work. These tools historically
validate the request contract and return compact receipts for CoS plus bounded
state-update packets. They do not run live Researcher, Forge, Hermes,
MiniMax, source adapters, browser collection, GitHub mutation, or model spend
by themselves. `cstar_forge_request` additionally persists an immutable Hall
request. Live intent remains `PENDING_AUTH` until the separate authorization
surface binds a one-shot root-user grant; `cstar_researcher_request` remains a no-spend
request receipt rather than an execution surface.

**Input contract:**
- `bead_id` or `decision_id` — CStar lifecycle anchor; a decision id is generated when needed.
- `state_update_thread_id` (optional) — mapped project information-repository
  destination for a bounded context/update packet. It is used only when targets
  are inside that project and never gates execution. The deprecated
  `owner_pmt_thread_id` alias is accepted for compatibility but grants no
  ownership, execution, approval, review, routing, monitoring, or lifecycle
  authority.
- `source_callback_thread_id` — CoS callback destination.
- `objective`, optional `prompt`, optional `target_paths`, optional `system_under_test`.
- `scope` and `authority_lane` (`green`, `yellow`, or `red`).
- `required_metrics[]` with `name` and `threshold` for each metric.
- `artifact_expectations[]` for expected report/package/evidence outputs.
- nonempty canonical `requested_actions[]` and `prohibited_actions[]`. Exactly
  one primary action is required: `request_receipt`, `response_only`, or
  `project_files`; modifiers are separately allowlisted. Missing, unknown,
  ambiguous, red-gated, or intersecting ids fail closed. Objective, prompt,
  paths, scope, and artifact prose are immutable context and never grant or
  remove action authority.
- `spend_policy` (`no_spend`, `dry_run`, or `live_authorized`), optional
  live-source/retry policy. Forge request/execute objects forbid the legacy
  freeform nested `operator_authorization_ref`.
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
  "status": "no_spend_request_recorded",
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
    "fail_closed_reason": "no_live_execution_requested"
  }
}
```

If a required metric, callback packet, prohibited-action list, or dispatch
surface proof is missing, the tools return `isError: true` with
`status: "rejected"` or a fail-closed receipt. A request never proves
implementation. A live-intent Forge request returns its complete
`authorization_manifest`, stable canonical JSON, and `request_sha256` while
remaining `PENDING_AUTH`; normal v3 responses expose no machine challenge. The
operator never pastes machine tokens. It becomes durable execution authority
only through the separate authorize surface and still requires the atomic
execute gate; all other request receipts are no-spend routing evidence.

If activation restarts Codex before authorization, the pending request and host
goal remain context but do not replay operator authority. The operator sends one
fresh ordinary instruction naming the work, such as `Continue building
TokenPath Q0 phase one.` Goal packets, restart acknowledgements, status
questions, and bare continuations remain non-authoritative and cause no provider
call.

## 4c. `cstar_forge_authorize`

Historical contract reference only. No public handler is registered, and no
current authorization or mutation path exists. The
retired contract was a no-spend authorization primitive for one immutable Forge request. Public inputs
are `forge_request_receipt_id`, `request_sha256`, and optional router-supplied
`goal_resume_id`. Operators must not author or paste bead ids, decision ids,
sidecar hashes, challenge tokens, target or scope material, or other authority
material. The ordinary path still requires the exact current root-user
authorization contract and fails closed on ambiguity, steering, forks,
subagents, negation, revocation, protected terms, or malformed evidence.

The exact lowercase `goal-resume-v2:<64 lowercase hex>` form is a kernel-produced
trusted continuity receipt. It can authorize the unchanged request after an
interruption without fresh repair wording. The kernel re-reads trusted request
and receipt data and derives the bead, decision, root-repair binding, and
continuity evidence while rechecking exact request/hash lineage and targets,
required outputs, actions, retry, spend, live-source, callback, package-lock,
and protected-gate boundaries. Current v2 text is liveness and revocation input
only; neutral questions, status, and unrelated prose do not create a new grant,
while explicit revocation, scope/target changes, forks, or protected terms veto
the continuity path.

The exact lowercase `goal-resume:<64 lowercase hex>` form is a compatibility
boundary only. The handler rejects it with
`forge_goal_resume_v1_historical_only`; it is never Forge authority. Thus the
bounded trusted-v2 continuity exception is the only cross-turn continuation
exception. It does not widen scope, reauthorize protected gates, or replay a
spent request, and it causes no provider call by itself.

For a newly created v3 request, requester thread, turn, and record-set lineage
must equal the authorizing operator turn and are included in the authorization
binding. An older unspent exact-profile v3 request may transition only inside
this authorize operation, after the operator explicitly names its durable work
reference; the request surface cannot perform that transition. The stored
projection records this bounded compatibility exception without storing raw
operator prose.

The tool re-hashes the canonical request and target set, verifies the request id,
adapter/capability, synthetic-only/no-live-source/zero-retry/one-attempt policy,
then verifies live Forge readiness after operator intent and before opening
writable Hall. For an explicitly selected legacy v2 adapter, the authorizing
turn is checked again after runtime/OAuth preflight immediately before
reservation; current v3 host handoff performs no provider or OAuth call. A red
runtime creates no authorization receipt. An unspent
`cstar.forge_request.v2` is not upgraded or reissued. A semantically identical
current request returns the original id/hash with a separate
`cstar.forge_legacy_v2_execution_grant.v1` compatibility manifest. The manifest
hash binds the original outputs/actions/locks, current sealed runtime, typed
`project_files` authority, `synthetic_only`, zero retries, one attempt, and no
live source. The sole exact compatibility challenge is
`CSTAR_FORGE_AUTHORIZE v2-compat-v1 ...
compatibility_manifest_sha256=<sha256>`. Authorization stores that sidecar
without changing the legacy canonical JSON or request hash. Before challenge
publication, the kernel atomically binds the verified reconciliation turn into
the legacy receipt's all-null requester-lineage extension, only while it is
pending, unattempted, and unauthorised. Replays preserve that first binding;
partial or competing writes cannot replace it. Missing or drifted sidecars,
widened semantics, prior authorization or attempt, expired, or terminal receipts
fail closed. No provider is invoked. The bound lineage lets a distinct third
root thread independently validate the delivered v2 attempt through
`cstar_record_result`; delivery alone remains non-authoritative.

Codex must verify the `authorization_manifest` against the accepted bead or
proposal before calling authorize. If the work reference is absent or
ambiguous, it asks one human-readable clarification; it never asks the operator
to echo the request hash or a challenge. After authorization, CoS must call
`cstar_forge_execute` for the initial reservation in that same root-user turn.
A later root-user turn can retrieve an already durable attempt with its original
idempotency key. It may create a child reservation only from an exact
`cstar.forge_pre_provider_continuation.v1` receipt for the same immutable,
unexpired, unrevoked request and original authorization.

## 4d. `cstar_forge_execute`

Historical contract reference only. No public handler is registered, and no
current execution, dispatch, replay, provider-call, or mutation path exists.
The retired execution primitive was intentionally separate from
`cstar_forge_request`. Current v3 live mode persists or replays a Codex-host
state-only handoff; it records the requested selector separately from
host-attested actual identity and performs no provider, cognition, or CStar
launch at handoff. For an explicitly selected legacy v2 adapter, no-op mode
validates shape without reserving an attempt, running Hermes/MiniMax, mutating
source, collecting live data, or spending. That legacy path requires the
matching durable request and authorization receipt, exact locks, its sealed
adapter runtime, and an idempotency key. Attempt reservation is atomic; an
ambiguous or failed legacy attempt consumes the grant and is never
auto-relaunched as provider spend.

A proven pre-provider mechanical cycle is different. Exact evidence of zero
provider requests, zero ambiguous dispatch, zero spend, no live source, and no
workspace commit records `FAILED_RETRYABLE` and `mechanical_no_provider` without
reducing the one-provider-attempt budget. CStar preserves the original request
and authorization, repairs the local defect, binds independent
`cstar_record_result` evidence to the repaired runtime and target preimages,
then resumes with a new internal idempotency key and `retry_of_attempt_id`.
Operators never paste either internal value or repeat the build prompt.
The first post-repair continuation check writes the bounded owner-only
`continuation-runtime-evidence.json` beneath the parent execution receipt;
independent validation hashes that CStar-produced adapter/interpreter/
containment/dependency/Hermes binding together with the named CStar-owned
runtime files, and CStar will not replace it after the validation is linked.
The prepared workspace preimages must still match that receipt before
`STARTED`; any appended same-turn revocation is later input, not part of the
original authorization.

Provider start or ambiguity, missing evidence, scope/worktree/lock drift,
expiry, revocation, or another request cannot inherit continuation. The third
consecutive identical failure and tenth total mechanical cycle are `BLOCKED`.
Zero retries still means zero provider, role, or orchestration retries.

Live request creation verifies readiness before runtime sealing,
reconciliation, or request persistence. Execute preserves no-op and durable
idempotent replay while readiness is red, but a new attempt captures the
runtime binding after execution authority, rechecks that same binding before
reservation, and checks it again after preparation immediately before adapter
start. Pre-reservation failure writes no attempt. A post-reservation binding
drift closes the one-shot attempt `FAILED_FINAL` with no adapter invocation or
spend.

Required fields include all `cstar_forge_request` contract fields plus:

- `forge_request_receipt_id` — must reference a `dispatch-forge-...` receipt.
- `forge_request_decision_id` — must match `decision_id` when `decision_id` is
  supplied.
- `forge_request_bead_id` — must match `bead_id` when both are supplied.
- `execution_mode` — `no_op` or `live_authorized`.
- `operator_authorization_ref` — the opaque reference returned by
  `cstar_forge_authorize`; required only at the outer execute level and must
  match the immutable authorization receipt.
- `idempotency_key` — stable key used for atomic reservation and replay.
- `retry_of_attempt_id` — kernel/router-populated parent only for an exact
  validated pre-provider continuation; it is not operator-facing input.
- Optional `execution_adapter_ref` — accepted only for explicit legacy-v2
  compatibility. Current v3 must omit it and queues only the codex-host
  state-only transport; any v3 adapter reference fails closed.

No-op mode returns `status: "validated_noop"` with
`forge_execution.attempted=false`, `live_spend=false`,
`live_source_collection=false`, and `codex_worker_fallback_allowed=false`.

Live mode rejects missing, expired, mismatched, or drifted authorization and
blocks when the requested adapter is unknown. A changed sealed runtime is
accepted only through the exact independently validated continuation binding.
Required outputs must be contained by explicit targets and included
in the canonical request/authorization manifest and exact request hash before
the challenge is accepted. Approved adapter references are:

### Legacy v2 adapter references (explicit selection only)

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

The design reference is `unclebob/swarm-forge`, branch `six-pack`, exact commit
`59803dadb38e0e09d5357d749452036e4a82ae60`. CStar copies no upstream source,
shell, Clojure, tmux, or Git-worktree orchestration implementation.

The runtime seal covers the adapter, absolute Python/Node interpreters,
Bubblewrap executable, worker safety/evidence helpers, private delegate plus
its evidence/preflight helpers, the CStar runtime-lineage verifier, and
`forge_role_plan.mjs`. Verified scripts are materialized
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

Adapter and provider children receive minimal allowlisted environments without
inherited secret values. Hermes exposes no tools under exact Forge mode:
`context_engine` remains an inert argv compatibility marker, while the
CStar-owned stdlib entrypoint loads no generic agent, plugin, MCP, tool, or
provider SDK. The CStar-owned launcher and manifest are lineage, not the
retired AutoBot checkout. Preflight binds root-owned system Python and the exact
five-file private runtime closure, including `forge_minimax_oauth.py` and the
token-free provider journal.
Before reservation, CStar creates one immutable 2100 seconds OAuth horizon
(1800-second execution cap plus 300-second margin) and binds its start,
deadline, request receipt, execute receipt, decision, adapter, and runtime
digest. The snapshot returns only the same redacted `minimax-oauth` readiness
proof for the existing Hermes-owned `cstar-hub` profile. Both preflights and all
six roles reuse that exact deadline; later roles never demand a sliding TTL.
CStar passes the non-secret `HERMES_HOME` profile selector but
never opens `auth.json`, receives a token, or authorizes refresh. Missing,
unsafe, expired, insufficient-scope, or refresh-required state fails without
reserving an attempt. The prepared invocation repeats the check and requires
the same proof. Existing durable idempotency-key replays bypass freshness
probing because they perform no new reservation or provider call. Live mode requires that bound
proof and launches an owner-private snapshot made from the same verified bytes
with isolated `-I -S -B`, no site-packages, and a fresh empty
`sys.pycache_prefix`; original `.pyc`, `.pth`, and site customization are not
executable. Exactly one fixed-host MiniMax HTTPS request is allowed per role
process. Each child appends token-free, hash-chained provider transitions from
`not_reached` through `response_body_complete`; CStar never infers dispatch from
a PID. A missing, malformed, regressing, or binding-mismatched journal makes
spend unknown. Known completed-role usage is retained even when a later role is
ambiguous; additional uncertainty can never be masked as `live_spend=false`.
The request receipt, execute receipt, decision, adapter, runtime digest,
role/phase/plan/handoff identity, reported model, and usage are validated in the
private response envelope.
CStar exposes only exact source preimages in a shadow workspace. Immediately
before provider start and again before, during, and after host commit, it
rechecks bounded no-follow source and package-lock snapshots. Caught exceptions
restore host file bytes/modes and remove created files, directories, stages,
and backups. Multi-file crash recovery remains inspection-required because the
host committer has no durable write-ahead journal.

Operators must not substitute `cstar_autobot`, Codex workers, direct Hermes, or
ad hoc shell execution for this gate. The private write-capable adapter invokes
Hermes through its `cstar-hub` profile pinned to `minimax-oauth/MiniMax-M3`; receipts
record requested and actual model identity separately and do not infer the
actual model when the provider omits it. The model response stays inside
private I/O and is never itself the durable delivery artifact. After exact
host commit, CStar persists a parent-built
`cstar.forge_delivery_receipt.v1` under
`work/forge-executions/<execution_receipt_id>/adapter-response.json`; it binds
canonical committed paths/hashes, the private response hash/size, and the
validated packet summary. Invalid responses persist only sanitized rejection
evidence, while structurally valid but uncommitted responses persist an
explicitly unverified receipt. Success-like private packets must not claim
missing files or artifact paths; missing path evidence fails closed as
`adapter_degraded`. Advisory-only packets, including the legacy label
`PASS-READY-FOR-PMT-REVIEW`, fail closed when required evidence is absent and
never grant review or acceptance authority.

Response validation walks worker-controlled artifact structures iteratively,
with a maximum depth of 64 and 10,000 total nodes. `files_changed` and artifact
path claims share one 1,000-claim cap before any filesystem probe. Every
`files_changed` item and every explicit `path`, `file`, `filename`, plural path
field, raw artifact-array item, or path-like object key must be an exact
nonblank string without surrounding whitespace. Claims are counted before
deduplication, canonical evidence roots are resolved once, and every unique
claim must resolve to a unique regular non-symlink file inside an evidence
root. Limit or structure failures retain their exact sanitized machine code;
the raw private response is never published.

A structurally valid packet is persisted as `delivered_unverified`; it is not
success. Independent, hash-verified evidence must be recorded with
`cstar_record_result`. Positive verified evidence finalizes the attempt as
`SUCCEEDED`; negative verified evidence finalizes it as `FAILED_FINAL`.
Validation persistence and Forge finalization are one transaction, so neither
state change survives alone.

An already-terminal `FAILED_FINAL` or `UNKNOWN` attempt may receive verified
`REJECTED`/`FAILURE` or `INCONCLUSIVE` evidence through
`mode: terminal_evidence_link`. That transaction links validation identity and
evidence only; request/attempt status, result, error, spend, retry, active
attempt, and completion fields remain unchanged. Positive evidence can never
resurrect a terminal failure.

## 5. `cstar_doctor`

Kernel diagnostics. Returns registry / Augury / database health plus telemetry
summary. `score` is a legacy diagnostic projection only; it is not a quality,
readiness, execution, or authority verdict. The TokenPath block reports
quarantine/compatibility telemetry and cannot steer or record observations.

**Input:** `{}` (empty object; no input fields).

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
  "token_path": {
    "status": "quarantined",
    "actionable": false,
    "advisor_available": false,
    "external_root_consulted": false,
    "advice_count_24h": 0
  }
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
  whose bead and repository exactly match and whose canonical manifest digest
  recomputes. Forge work requires `authority_class=verified_v2` and an exact
  `cstar.validation-evidence.v2` request/authorization/attempt/adapter/result
  binding, with a validator distinct from both the Forge requester and
  authorizing executor. Host work may use `authority_class=verified_v3` and an exact
  `cstar.validation-evidence.v3` bead/repository/target binding plus a verified
  depth-one validator session parented by the recording root CoS. V3 grants no
  Forge-finalization authority.
- `lore_paths` and `isolation_paths` accept only safe relative, non-symlink,
  single-link files inside the CStar root. Their current bytes and SHA-256 must
  exactly appear in that validation manifest. Absolute paths and arbitrary
  caller file reads are rejected.
- The receipt and every referenced evidence file are reverified at resolution;
  stale receipts or changed files fail closed. Cached bead metadata is not
  evidence.
- Caller-supplied scalar scores, claimed Warden results, `force`, and mandate
  exemptions grant no authority. Historical Gungnir fields remain compatibility
  telemetry only.

Detached TypeScript/Python validation constructors also fail closed: zero
evaluated checks, missing independent evidence, invalid evidence hashes, or
zero benchmark/SPRT denominators yield `INCONCLUSIVE`, never `ACCEPTED`. See
`docs/architecture/validation-evidence-contract.md`. Only a hash-verified
`cstar_record_result` receipt can become authoritative Hall validation.

**Output:** `{ status: 'created'|'claimed'|'resolved'|'blocked'|'updated'|'ok', mutation, bead: {...} }` or `{ status: 'ok', count, beads: [...] }` for list.

## 8. `cstar_goal_resume`

Append one immutable v2 continuity record after a blocked host goal is resumed
while the host exposes no supported resume transition. The public MCP
registration accepts exactly these three top-level input fields:

- `forge_request_receipt_id` — the exact stored Forge request receipt id
- `request_sha256` — the exact lowercase SHA-256 of that stored request
- `host_goal_projection` — a strict `cstar.host_get_goal_projection.v1` object

The projection has exactly these fields: `schema`, `threadId`, `objective`,
`status` (`blocked`), `tokensUsed`, `timeUsedSeconds`, `createdAt`, `updatedAt`,
and `hostResumeCapability` (`unavailable`). Counters are validated transient
host observations. Objective hashing covers its exact UTF-8 bytes without trim
or Unicode normalization. Raw objective text and transient counters are not
durably persisted.

The kernel reads the stored request and derives its request bead, decision,
target/scope, package-lock, action, callback, and other exact lineage together
with the immutable root-repair sidecar. Callers cannot supply lineage or
authority fields. Request/hash integrity, active bead and root-thread lineage,
continuity evidence, replay history, and all existing protected gates remain
kernel checks.

The sidecar is `cstar.forge_request_root_repair_binding.v1`. Current-v3 stores
its semantic `adapter_ref` as null; a local schema check widens an older NOT
NULL column transactionally while preserving historical non-null adapter
values byte-for-byte. Legacy-v2 adapter selection remains explicit
compatibility state and is never a current-v3 sidecar fallback.

**Output:** `{ status: 'recorded'|'replayed', mutation, resume_id: 'goal-resume-v2:<64 lowercase hex>', goal_ref, resume_generation, previous_resume_id, host_status_mutated: false, authority_effect: 'continuity_only' }`.

Exact replay returns the existing v2 event and does not create a second event.
Resume is continuity-only: it creates no new provider call, spend, Forge
request, authorization, or attempt, and it does not inherit protected-gate
authority. The durable event contains canonical hashes and bounded lineage,
never raw objective, transient counters, or operator prose.

Historical internal-only compatibility facts are retained for old receipts and
evidence: `goal-resume:<64 lowercase hex>`, `repair_bead_id`,
`continued_bead_id`, `decision_id`, `host_goal_objective_sha256`,
`host_goal_snapshot_sha256`, `observed_host_status`, and
`host_resume_capability`. These fields are not accepted by the current public
registration or Forge authorization. A v1 Forge id is rejected with
`forge_goal_resume_v1_historical_only` and can never provide Forge authority.

## 9. `cstar_spoke_bead_import`

Rich Bead-import surface for spokes. Hard-rejects unregistered, inactive,
quarantined, read-only, or `mount_token=unproven` spokes. Lore and design files
must be contained, bounded, non-symlink, single-link files under the exact
canonical mounted root. Only safe relative paths are persisted; absolute target
paths and unstructured caller metadata are rejected.

**Input (selected required):**
- `spoke` (string) — registered spoke slug
- `intent`, `acceptance_criteria` (strings)
- `lore_path` (string) — Gherkin .feature file, must exist on disk

**Optional:** `bead_id`, `design_doc_path`, `wireframe_ref`, `threat_model_summary`, `contract_refs`, `checker_shell`, `target_paths`, `target_kind`, `target_ref`, `augury_block`, `assigned_agent`, `status`. The deprecated `metadata` input must remain empty.

**Output:** `{ status: 'created', action: 'spoke_bead_import', mutation, spoke, repo_id, bead }`.

## 10. `cstar_record_result`

Record validation against a repository-local bead. The current route accepts a
hash-bound host-native controller artifact and fresh outside-ancestry
independent-validator artifact directly. Positive reported verdicts without
hash-verified independent evidence are stored as `INCONCLUSIVE` rather than
authoritative. Historical Forge subjects are evidence-only and cannot be
created or dispatched through the public kernel.

**Input:**
- `bead_id` (string, required)
- `verdict` (enum: `ACCEPTED|REJECTED|INCONCLUSIVE|SUCCESS|FAILURE`, required)
- `notes` (string, optional)
- `validation_id` (string, optional) — caller-stable validation identity
- `forge_execution_receipt_id` (string, optional) — transactionally finalizes
  a delivered attempt or links verified non-positive evidence to an explicitly
  supported terminal attempt
- `host_validation_receipt` (object, optional) — host-workflow receipt containing
  `validator_thread_id`, `validator_turn_id`, `manifest_path`, and
  `manifest_sha256`. It is mutually exclusive with
  `forge_execution_receipt_id`. CStar derives the parent/root relationship from
  the fixed Codex session and requires one latest completed final turn whose
  text binds the exact manifest digest and validation id.
  In a separated live launcher, manifest, artifact, check, Lore, and Isolation
  bytes resolve only from `CODE_ROOT`; bead lookup and Hall persistence remain
  under `CONTROL_ROOT`.
- `validation_evidence` (object, optional) — bounded artifact/check paths and
  SHA-256 hashes only. For Forge v2, CStar derives validator identity and
  independence from the current request and exact execution receipt. For host
  v3, the independently hashed manifest is authoritative and CStar derives
  these arrays from it; when supplied for legacy compatibility, the arrays must
  be semantically equal. Caller-supplied identity or independence fields are
  rejected by the strict tool schema.
- `host_artifact_validation_receipt` (object, optional) — current host-native
  route. It binds exact controller and validator artifact paths, SHA-256 hashes,
  controller/validation identifiers, and executor identity. Both artifacts must
  be regular contained files under the repository or configured durable receipt
  root. The validator must report `ACCEPTED`, fresh outside-ancestry independence,
  and zero protected effects. No Forge receipt or transcript lookup is required.

Validation persistence and delivery finalization/terminal evidence linkage are
one transaction. If either
side fails, the validation row is rolled back and the response reports
`validation_persisted: false`, `validation_authority: "not_persisted"`, and no
stored verdict. TokenPath is not part of this generic result contract; its
quarantined sidecar lifecycle cannot be supplied or promoted through this tool.

Only historical `authority_class=verified_v2` evidence can finalize an already
delivered historical Forge subject; no current Forge subject can be created.
Sterling accepts current exact `verified_v3` host-workflow evidence or
`verified_v4` host-native artifact evidence.
Legacy `cstar.validation-evidence.v1` receipts remain readable but cannot be
promoted, replayed across executions, or used as current validation authority.
The verified Hall write additionally consumes a one-use opaque proof produced
by the kernel request-identity verifier; generic Hall writers remain
reported-only and cannot self-mint verified-v2, verified-v3, or verified-v4
authority.

**Output:** `{ status, mutation?, bead_id, reported_verdict, stored_verdict, validation_id, validation_persisted, validation_authority, authoritative, forge_validation? }`, where `validation_authority` is `reported`, `verified_v2`, `verified_v3`, `verified_v4`, or `not_persisted`.

## 11. `cstar_engram_record`

Publish an Engram to the Hall. Spokes use this as the dead-drop write surface for cross-system events. Fires `cstar_war_game_score` if intent matches a registered contest defender prefix.

**Input:**
- `intent` (string, required)
- `bead_id` (string, required)
- `spoke` (string, optional) — must be active/trusted/read_write
- `metadata` (object, optional)
- `memory_id` (string, optional)

**Output:** `{ status: 'recorded', mutation, memory_id, intent, bead_id, repo_id, score_results? }`.

## 12. `cstar_war_game_score`

War-game scoring. Actions: `register_contest`, `tally`, `recent`, `by_scenario`, `get_score`, `list_contests`. Scoring fires automatically when `cstar_engram_record` receives an Engram whose intent matches a registered contest defender prefix.

**Input:** `action` (enum), plus action-specific fields (see `tests/integration/war_game_scoring.test.ts` for full examples).

`register_contest` returns `{ status: 'registered', contest_id, mutation }`. Read actions return query envelopes without `mutation`.

## 13. `cstar_manifest`

Capability discovery. Hub registry merged with spoke-local manifests, namespaced
`<slug>:<id>`. A spoke manifest is read only after an exact Hall/on-disk
`mount_token` match; `unproven` is rejected. Reads are bounded, reject symlink
and hardlink files, and never enter private homes. Results use relative
authority paths and omit raw roots. The default hub projection excludes
`entry_surface: compatibility`; use exact `cstar_skill_info` lookup for an
explicit compatibility capability. Read-only; announce-only per
BEAD-CSTAR-SPOKE-DISCOVERY-001.

**Input:**
- `scope` ("hub" | "spoke" | "all", optional, default "hub")
- `spoke` (string, optional) — narrows spoke walk when scope is spoke/all

## 14. `cstar_skill_info`

Per-capability contract. Resolves `<slug>:<id>` to a bounded, verified spoke
SKILL.md plus redacted invocation metadata; bare ids go to the kernel registry.
Bare hub ids, including exact compatibility ids such as `calculus`, remain
discoverable even when they are absent from the default manifest. The response
never returns a raw working-directory root.

**Input:**
- `id` (string, required)
- `spoke` (string, optional) — override parsed slug

## 15. `cstar_spoke_journal`

Four-file journal state for a registered spoke: `memory.md`, `tasks.md`,
`wireframe.md`, `DEV_JOURNAL.md`. An exact `mount_token` binding is required;
`unproven` fails closed. Reads are bounded, reject symlink and hardlink files,
and never enter private homes. Reports relative path, presence, mtime, SHA-256,
size, summary, and a root SHA-256—never the raw root. Memory-file drift between
`.agent/` and `.agents/` is flagged.

**Input:**
- `spoke` (string, required)

## 16. `cstar_pennyone_context`

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

## 17. `cstar_mongo_mailbox`

Fail-closed compatibility tombstone for the retired external Mongo mirror and
intent queue. Mongo never became a verified CStar authority surface, and the
old implementation depended on a secret-bearing ambient URI. Every action now
returns the same retirement error before environment access, driver import,
network activity, or mutation. Use bounded `cstar_pennyone_context` reads and
the named CStar lifecycle tools instead.

**Input:**
- `action` (`status` | `mirror_counts` | `enqueue_operator_intent`, required)
- `operator_authorization_ref` (string, required for `enqueue_operator_intent`)
- `intent_action` (`accept` | `decline` | `refine` | `dispatch` | `edit`, required for `enqueue_operator_intent`)
- `proposal_id` (string, required for `enqueue_operator_intent`)
- `payload` (object or null, optional)
- `actor` (string, optional; defaults to `cstar-kernel-mcp`)

**Output:**
```json
{
  "error": "legacy_mongo_mailbox_retired_use_cstar_kernel_hall_surfaces",
  "status": "retired",
  "decommissioned": true,
  "actuated": false,
  "network_accessed": false,
  "secret_source_read": false
}
```

A caller-supplied authorization string remains evidence, not authority, and
cannot reactivate the compatibility surface. No environment flag or installed
driver changes this result.

## 18. `cstar_status`

Deterministic current-state snapshot. CStar lifecycle state is separated from
the legacy framework projection; persona supplies non-authoritative tone and
development-process guidance only.

**Input:** `{ "forge_execution_receipt_id"?: "forge-execute-<32 lowercase hex>" }`

**Output:**
```json
{
  "framework": { "authority": "compatibility_projection", "status": "AWAKE", "process_uptime_seconds": 0, "baseline_gungnir_score": 0 },
  "current_mission": { "authority": "cstar_lifecycle", "current_bead_id": "bead-...", "target_paths": ["..."] },
  "persona": "A.L.F.R.E.D." | "O.D.I.N." | null,
  "persona_projection_status": "bounded_config_projection" | "bounded_config_invalid" | "bounded_config_reader_unavailable" | "self_consistent_unverified" | "legacy_self_consistent_unverified" | "unavailable",
  "forge_execution": { "found": true, "attempt_status": "STARTED", "request_status": "AUTHORIZED", "recovery": { "classification": "owner_alive" } },
  "workspace": "/abs/path",
  "hall_reachable": true,
  "managed_spokes": [{ "slug": "...", "mount_status": "active", "trust_level": "trusted", "write_policy": "read_write", "root_path": "..." }],
  "agents": [{ "id": "gemini", "name": "Gemini", "status": "SLEEPING", "last_seen": null }]
}
```

`baseline_gungnir_score` and other compatibility fields are historical
telemetry, not measured validation, confidence, or readiness evidence.

The bounded top-level `persona` scalar is the only supported active-persona
read surface. Kernel callers must not open, parse, print, diff, or request
`.agents/config.json` or any containing object. The isolated
`scripts/read_active_persona.py` runtime boundary reads only the configured
persona field and emits only one canonical scalar; status never receives the
containing object. Only an absent config may use an already marked Hall
compatibility fallback. Malformed or conflicting config and an unavailable
isolated reader fail closed with their own projection status. If neither
bounded source is available, omit persona context and report a freshness gap.
There is no active persona default.

When an exact Forge execution receipt is supplied, status adds a bounded,
read-only attempt/request projection. It never invokes or retries the adapter.
A `STARTED` attempt reports exact-owner liveness when the trace contains owner
proof; legacy ownerless traces report the hard reconciliation deadline.

Persona also supplies non-authoritative development posture. `O.D.I.N.` is
`build_run_repair`: build the bounded implementation, run it, repair
recoverable failures, and continue to validation. `A.L.F.R.E.D.` is
`secure_harden`: establish working behavior, then emphasize trust boundaries,
abuse cases, failure containment, hardening, and validation. Neither posture
changes scope, authority, or an operator gate.

Persona provenance fails closed. Bootstrap rows, legacy migrations, document
ingestion, user profiles, profile digests, and SessionStart hooks cannot create
or change the active persona even when they carry a nonzero timestamp. A
migration may preserve an already-explicit Hall projection, but must ignore the
legacy persona field. Runtime coordination actors and ceremony behavior remain
authority-neutral; an explicit status scalar may affect presentation and
non-authoritative development posture, but never scope, routing authority, or
an operator gate.
An explicit Hall projection requires a `cstar.persona_projection.v2`
SHA-256 self-consistency marker bound to the exact canonical scalar. That
marker proves row consistency, not source authority or independent validation;
generic source labels, including arbitrary import or doctrine-ingestion names,
are never authority.

The legacy `StateRegistry` is read-only. Its mutation methods fail with
`legacy_state_registry_mutation_retired_use_cstar_kernel` before Hall or
filesystem effects, and status never falls back to
`.agents/sovereign_state.json` or generic `sovereign_projection` metadata.

## 18a. `cstar_persona_set`

Explicitly select one style-only process posture for the next workflow
boundary. The tool accepts only the exact scalar `O.D.I.N.` or
`A.L.F.R.E.D.`, verifies a canonical root-user Codex request identity, and
performs no provider, source, Git, or deployment action.

**Input:**

```json
{ "persona": "O.D.I.N." | "A.L.F.R.E.D." }
```

The kernel invokes an isolated system-Python writer with a secret-free
environment. That writer validates ownership, permissions, link count, size,
and JSON structure; updates only recognized persona fields; preserves unknown
fields without emitting them; and atomically replaces the config. CStar then
re-reads the bounded scalar and mirrors a self-consistent Hall projection.

The response is `updated` or `already_active`, includes the prior/current
canonical scalar and config digest, and reports any Hall mirror freshness gap.
It also returns the process posture:

- O.D.I.N.: `iterative_build_run_test_repair`.
- A.L.F.R.E.D.: `secure_harden_verify`.

Both remain iterative and style-only. Neither changes objective, targets,
actions, spend, source, retry, Git, restart, secret/config, deployment, or
production gates. See `docs/operations/cstar-iterative-development.md`.

## 19. `cstar_evolve`

Read-only inspection of evolve proposals and SPRT history. Proposal generation and adversarial critique are LLM-driven and stay host-native (not exposed here).

**Input:**
- `action` ("list_proposals" | "get_proposal" | "list_sprt_history", required)
- `proposal_id` (string, required for get_proposal; must match `[a-zA-Z0-9._-]+`, no path components)
- `limit` (number, optional, 1..100)

**Path-traversal guard:** `proposal_id` is rejected if it contains `/`, `\`, or `..`. Maximum proposal size: 512 KB.

## 20. `cstar_spoke`

Redacted mounted-spoke inspection and exact-match prune preview. The historical
mutation path is retired because it mixed Hall writes, arbitrary filesystem and
Git reads, private Hermes profile discovery, and secret-bearing outputs without
a request-scoped authority contract.

**Input:**
- `action` ("list" | "link" | "unlink" | "inspect" | "project" | "doctor" | "prune" | "verify" | "health", required)
- `slug` (string, required for link/unlink/inspect/project/verify/health; normalized to `[a-z0-9._-]+`, 1..64 chars)
- `root_path`, `kind`, `remote_url`, `branch`, `trust_level`, `write_policy`,
  `accept_beads`, `skip_init` — ignored legacy mutation inputs; never read or returned
- `targets` — exact Hall row/root pairs for prune preview
- `dry_run` — must be explicitly `true` for prune preview
- `cleanup_artifacts` — must remain false

`link`, `unlink`, `project`, and non-dry or artifact-cleaning `prune` return
`spoke_mutation_requires_verified_request_scoped_operator_attestation` before
path, remote, Git, private-home, writable-Hall, or spoke-filesystem activity.
`list`, `inspect`, and `doctor` expose an allowlist of lifecycle fields plus
SHA-256 bindings; raw roots, repository ids, remotes, branches, metadata,
credentials, PII, and mount tokens are omitted. Doctor does not probe mounted
paths. `prune` with `dry_run=true` performs only exact Hall row/root comparison
and returns hashes. `verify` and `health` require an exact, bounded,
non-symlink, single-link `mount_token` identity file; `unproven` is not accepted.

## 21. `cstar_intent_route`

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

## 22. `cstar_warden`

Sentinel Wardens on demand. The public tool is classified `EXECUTION` at its
highest-effect action because `scan` starts a local process. Python-side
scanners are deterministic AST/text checks. Inventory is static and starts no
process. A scan uses only the canonical repository-venv interpreter and
`scripts/run_warden.py` with Execa environment extension disabled; the child
receives only project `PYTHONPATH`, deterministic Python controls, and bounded
temporary paths. Warden base classes have no provider/search client. Huginn is
regex-only, and the retired Shadow Forge warden is not registered.

**Input:**
- `action` ("list" | "bounties" | "scan", required)
- `warden` (string, required for scan; must match `[a-z0-9_]+`, 1..64 chars)
- `target` (string, optional for scan) — path inside the project root. Directory targets become the warden's effective root (constraining scan scope). File targets are surfaced as advisory metadata.

**Output (list):**
```json
{
  "status": "ok",
  "source": "static_deterministic",
  "count": 11,
  "wardens": [{ "slug": "norn", "module": "src.core.engine.wardens.norn", "class": "NornWarden" }]
}
```

**Output (scan):** Envelope includes `status`, `warden`, `root_used`, `exit_code`, plus driver fields. `status` will be one of: `ok` / `unknown_warden` / `import_failed` / `dependency_missing` / `scan_failed` / `invalid_root`. The `dependency_missing` envelope includes `missing_module` so hosts can decide whether to install or skip.

**Output (bounties):** Reads `.agents/tech_debt_ledger.json` (cached PennyOne sweep).

## 23. `cstar_telemetry`

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
  "token_path": {
    "status": "quarantined",
    "actionable": false,
    "advisor_available": false,
    "external_root_consulted": false,
    "advice_count_24h": 0,
    "observation_count_24h": 0
  },
  "guardrail": { "verdict": "allow", "action": "continue", "...": "..." },
  "next_action": "Use telemetry warnings to pick the next hardening target."
}
```

TokenPath telemetry reads only bounded regular historical JSONL under the CStar
project root; symlink, hardlink, oversized, malformed, or missing inputs fail
closed. It never treats those rows as promotion, probes an external advisor
root, or turns compatibility telemetry into a current recommendation.

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
