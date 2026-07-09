# cstar-kernel MCP — API Reference

> The authoritative kernel surface for Corvus Star. Every tool is deterministic — no LLM inference inside the tool execution path. Host agents (Claude, Gemini, Codex) call these tools directly over MCP rather than shelling out to `./cstar`.

## Source of Truth

- **Server:** `bin/cstar-kernel-mcp.js` → `src/tools/cstar-kernel-mcp.ts`
- **Registration site:** `server.tool(...)` calls in `cstar-kernel-mcp.ts`
- **Server name:** `cstar-kernel`
- **Transport:** stdio (JSON-RPC 2.0, newline-delimited)
- **Current SDK protocol:** `2024-11-05` over stdio
- **2026-07-28 readiness posture:** tool handlers are protocol-session independent; cross-call state uses explicit CStar handles
- **Registry shipped to hosts:** `gemini-extension.json#mcpServers` (Gemini) and `plugins/corvus-star/.mcp.json` (Codex)

The driver `bin/cstar-kernel-mcp.js` re-execs Node with the TSX loader against `src/tools/cstar-kernel-mcp.ts`. The server keeps stdin open and exits cleanly on `SIGTERM` or stdin close.

For Codex Desktop-on-WSL, `/home/morderith/.codex/bin/wsl/cstar-kernel-mcp-wrapper` should launch `bin/cstar-kernel-mcp-bridge.js`. The bridge proxies stdio through the local CStar TCP daemon when it is available, then falls back to the direct source launcher. This keeps the Codex-side MCP process alive across child refreshes and prevents stale direct-launch children from pinning old tool schemas.

Hermes gateway MCP registrations should follow the same rule: launch the source-backed bridge or `bin/cstar-kernel-mcp.js`, never `dist/cstar-kernel-mcp.bundle.js`. A gateway-supervised dist child can respawn after manual process retirement and reintroduce stale schemas.

## Operational Mandates

1. **Host-Agent Run First.** MCP handlers wrap deterministic work only. Any LLM inference per iteration must be driven by the host agent or a spawned sub-agent — never by an MCP tool calling back out to an LLM.
2. **Registry outranks prose.** When in-tree docs disagree with `.agents/skill_registry.json` or the runtime, follow the registry/runtime.
3. **Authority order for capability discovery.** `cstar_manifest` and `cstar_skill_info` are the canonical surfaces. Spoke skills are namespaced `<slug>:<id>`.
4. **Bead anchoring.** Multi-file changes anchor to a Hall bead via `cstar_bead`. The `cstar_handoff` tool returns the active planning state for resuming work.
5. **Stateless-protocol readiness.** No tool input schema may require protocol session ids, protocol version, or client metadata. If a workflow needs continuity, return and require an explicit domain handle such as `bead_id`, `validation_id`, `spoke`, `memory_id`, or `token_path_episode_id`.
6. **Routing boundary.** Corvus implementation ownership routes CoS -> Corvus - MM -> PMT -> worker. The Researcher thread is a special monitored pipeline, not a normal PMT worker. Preserve operator gates for acceptance, dispatch, commit, push, merge, deletion, restarts, and publish actions.
7. **Degraded MCP behavior.** If the MCP surface is unavailable or degraded, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.

## MCP 2026-07-28 Release-Candidate Readiness

The MCP `2026-07-28` release candidate removes the protocol-level `initialize`/`initialized` handshake and `Mcp-Session-Id` session model for Streamable HTTP. It also moves protocol/client metadata onto each request, introduces `server/discover`, requires routable `Mcp-Method` / `Mcp-Name` headers for HTTP, adds cache metadata (`ttlMs`, `cacheScope`) for list/read results, moves Tasks into an extension, deprecates Roots/Sampling/Logging, and lifts tool schemas to full JSON Schema 2020-12.

CStar's hardening stance:

- Keep the current stdio SDK handshake as compatibility only. It must not become an application state contract.
- Keep tool handlers deterministic and reentrant. Any request should be satisfiable from the request arguments plus persisted Hall/kernel state.
- Use explicit CStar handles for stateful application behavior: `bead_id`, `validation_id`, `spoke`, `memory_id`, `token_path_episode_id`, and similar domain ids.
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

`cstar_autobot` may appear in legacy or compatibility inventories, but AutoBot/Hermes is not the active Corvus routing path. New implementation routing must use the CoS -> Corvus - MM -> PMT -> worker chain and CStar bead lifecycle state. Do not delegate new Corvus work through AutoBot/Hermes unless a future operator-approved contract explicitly reactivates that path.

---

## Tool Inventory (26)

| # | Tool | Tier |
|:---|:---|:---|
| 1 | `cstar_handoff` | Active state |
| 2 | `cstar_hall_search` | Discovery |
| 3 | `cstar_hall_maintenance` | Discovery |
| 4 | `cstar_augury` | Routing |
| 5 | `cstar_researcher_request` | Dispatch request |
| 6 | `cstar_forge_request` | Dispatch request |
| 7 | `cstar_forge_execute` | Execution gate |
| 8 | `cstar_autobot` | Legacy AutoBot/Hermes delegation |
| 9 | `cstar_doctor` | Diagnostics |
| 10 | `cstar_verify_plan` | Verification |
| 11 | `cstar_bead` | Bead lifecycle |
| 12 | `cstar_spoke_bead_import` | Bead lifecycle |
| 13 | `cstar_record_result` | Verification |
| 14 | `cstar_engram_record` | Memory write |
| 15 | `cstar_war_game_score` | War games |
| 16 | `cstar_manifest` | Capability discovery |
| 17 | `cstar_skill_info` | Capability discovery |
| 18 | `cstar_spoke_journal` | Spoke state |
| 19 | `cstar_pennyone_context` | Data context |
| 20 | `cstar_mongo_mailbox` | Data mailbox |
| 21 | `cstar_status` | Diagnostics |
| 22 | `cstar_evolve` | Karpathy loop (read-only) |
| 23 | `cstar_spoke` | Spoke lifecycle |
| 24 | `cstar_intent_route` | Routing |
| 25 | `cstar_warden` | Sentinel Wardens |
| 26 | `cstar_telemetry` | Diagnostics |

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

Engram lesson study / harvest queue.

**Input:**
- `action` ("study" | "harvest", required)
- `memory_id` (string, required for study)
- `limit` (number, optional, default 5)

## 4. `cstar_augury`

Route one mission and return routing advice + Council expert + Mimir targets + token_path hints.

**Input:**
- `prompt` (string, required) — user prompt or mission statement
- `inferred_intent` (string, optional)
- `target_paths` (string[], optional)
- `scope` (string, optional)
- `bead_id` (string, optional) — links token-path advice to later `cstar_record_result` observation feedback

**Output (matched):**
```json
{
  "intent_category": "BUILD",
  "default_path": "creation_loop",
  "expert": "carmack",
  "expert_label": "...",
  "expert_lens": "...",
  "expert_signature_question": "...",
  "expert_guardrails": ["..."],
  "token_path": { "advisor": "augury-token-path", "episode_id": "mcp-tp-...", "selected_policy": "...", "..." }
}
```

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
validate the request contract and return compact receipts for PMT/MM/CoS
review. They do not run live Researcher, Forge, Hermes, MiniMax, source
adapters, browser collection, GitHub mutation, or model spend by themselves.

**Input contract:**
- `bead_id` or `decision_id` — CStar lifecycle anchor; a decision id is generated when needed.
- `owner_pmt_thread_id` and `source_callback_thread_id` — review owner and callback destination.
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

**Output posture:**

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
`status: "rejected"` or a dry-run receipt with `fail_closed_reason`. Operators
must not treat these receipts as implementation output; they are dispatch
authorization and evidence-routing artifacts.

## 4c. `cstar_forge_execute`

Execution primitive for Corvus Forge. It is intentionally separate from
`cstar_forge_request`: request receipts prove that work is ready to route;
execution receipts prove that a specific request receipt is linked to, and when
authorized routed through, an operator-authorized Forge execution contract.

No-op mode does not run Hermes, MiniMax, SwarmForge, Researcher, source
adapters, browser collection, GitHub mutation, or model spend. Live-authorized
mode invokes only the approved Forge/Hermes/MiniMax adapter after receipt,
operator, metrics, callback, retry, and prohibited-action gates pass.

Required fields include all `cstar_forge_request` contract fields plus:

- `forge_request_receipt_id` — must reference a `dispatch-forge-...` receipt.
- `forge_request_decision_id` — must match `decision_id` when `decision_id` is
  supplied.
- `forge_request_bead_id` — must match `bead_id` when both are supplied.
- `execution_mode` — `no_op` or `live_authorized`.
- `operator_authorization_ref` — required for `live_authorized`.
- Optional `execution_adapter_ref` — checked as an adapter proof; missing or
  unregistered adapters fail closed.

No-op mode returns `status: "validated_noop"` with
`forge_execution.attempted=false`, `live_spend=false`,
`live_source_collection=false`, and `codex_worker_fallback_allowed=false`.

Live mode rejects missing operator authorization and blocks with
`fail_closed_reason: "missing_authorized_execution_adapter"` when the requested
adapter is unknown. Approved adapter references are:

- `cstar-forge-hermes-minimax-adapter` — response-only; may write only the
  adapter response artifact and fails closed for build/package/source-mutation
  requests with `adapter_lacks_implementation_write_capability`.
- `cstar-forge-hermes-minimax-worker-adapter` — write-capable; asks the Hermes
  MiniMax delegate for a strict file manifest, validates paths against the
  sealed intent target roots, applies bounded project files, and emits the same
  response artifact contract.

Operators must not substitute `cstar_autobot`, Codex workers, or ad hoc shell
execution for this gate. An executed receipt reports
the adapter status, whether the adapter observed live spend, and any returned
ledger or artifact references. For live adapter execution, the model response is persisted
under `work/forge-executions/<execution_receipt_id>/adapter-response.json` and
the receipt reports the response artifact path, byte count, and sha256 so PMT
review does not depend on transient stdout. The persisted adapter response must
match the Forge execution packet shape: `status`, `summary`, `files_changed`
array, structured `artifacts`, structured `validation`, structured `metrics`,
structured `boundaries`, and optional `callback_packet`. Success-like statuses
must not claim missing changed files or artifact paths; missing path evidence
fails closed as `adapter_degraded`. Advisory-only packets such as
`PASS-READY-FOR-PMT-REVIEW` without the required evidence fields also fail
closed; PMT review remains required before acceptance.

## 5. `cstar_doctor`

Kernel diagnostics. Returns registry / augury / database health plus telemetry summary.

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

Append validation outcome and optionally connect it to a bead. Feeds the Augury token-path sidecar calibration loop.

**Input:**
- `bead_id` (string, required)
- `verdict` (enum: `ACCEPTED|REJECTED|INCONCLUSIVE|SUCCESS|FAILURE`, required)
- `notes` (string, optional)
- `token_path_episode_id` (string, optional) — episode id from a prior `cstar_augury` response
- `token_path_observation` (object, optional) — scenario_class + selected_policy + observed_tokens for sidecar calibration

When `token_path_observation` is not supplied, the tool attempts to auto-link
recent `cstar_augury` token-path advice by explicit episode id, bead id, or bead
target path. Every response reports `token_path_observation_status`. A missing
observation is explicit, not silent.

**Output:** `{ status: 'recorded', mutation, bead_id, verdict, validation_id, token_path_observation_status, token_path_observation_id?, token_path_observation_source?, token_path_observation_warning?, token_path_episode_id? }`.

**Observation statuses:**
- `recorded` — an explicit payload or auto-linked recent advice wrote an observation row.
- `not_recorded` — no usable advice/payload was available; inspect `token_path_observation_warning`.

Common warnings include `no_recent_token_path_advice_linked`,
`token_path_episode_id_not_found`, and
`malformed_token_path_observation_skipped`.

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

`enqueue_operator_intent` is the only mutation action. It requires an explicit
operator authorization reference and writes a small pending intent envelope to
the configured intent queue. This tool must never expose credentials, arbitrary
Mongo queries, collection-selection passthrough, or direct Hall/PennyOne
mutation bypasses.

## 17. `cstar_status`

Deterministic framework snapshot: status, persona, gungnir score, managed spokes, agent presence, `hall_reachable`, `uptime_seconds`.

**Input:** _(none)_

**Output:**
```json
{
  "framework": { "status": "AWAKE", "active_persona": "A.L.F.R.E.D.", "uptime_seconds": 0, "gungnir_score": 0, "intent_integrity": 0 },
  "workspace": "/abs/path",
  "hall_reachable": true,
  "managed_spokes": [{ "slug": "...", "mount_status": "active", "trust_level": "trusted", "write_policy": "read_write", "root_path": "..." }],
  "agents": [{ "id": "gemini", "name": "Gemini", "status": "SLEEPING", "last_seen": null }]
}
```

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
  "default_path": "creation_loop",
  "tier": "WEAVE",
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
    { "intent_category": "BUILD", "default_path": "creation_loop", "tier": "WEAVE", "matched_triggers": ["build"] },
    { "intent_category": "OBSERVE", "default_path": "scan", "tier": "PRIME", "matched_triggers": ["status", "check"] }
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
3. Register the tool through `src/tools/cstar-kernel-mcp/register_core_tools.ts` using `server.tool('cstar_<name>', mcpToolDescription(...), schema, instrumentTool('cstar_<name>', handler))`.
4. Re-export the handler from `src/tools/cstar-kernel-mcp.ts` only when tests or host-facing code need a direct import.
5. Add a `{ name, purpose }` entry to `KERNEL_MCP_TOOLS` in `src/packaging/distributions.ts` (this propagates into `GEMINI.md` and the Codex `SKILL.md` on the next `npm run build:distributions`).
6. Add an entry to this file in tool-number order.
7. Add focused unit tests under `tests/unit/cstar-kernel-mcp/`, then import them from `tests/unit/test_cstar_kernel_mcp.test.ts` so legacy checker commands still run the full suite.
8. Add an assertion to the stdio integration test's "expected tools" list in `tests/integration/cstar_kernel_mcp_stdio.test.ts`.
9. Confirm the new input schema is object-rooted and does not introduce protocol/session/client metadata as tool arguments.
10. Keep every production MCP file and focused test file under 500 lines; `tests/unit/cstar-kernel-mcp/test_file_size_contract.test.ts` enforces this.
11. Run the focused unit suite, stdio integration suite, `node --check bin/cstar-kernel-mcp.js`, and `git diff --check` before committing.

## What Does Not Belong on This Surface

- **LLM inference per iteration** — proposal generation, critique, oracle sampling, autonomous mutation. These stay host-native.
- **Terminal-bound flows** — `start`, `tui`, `ravens`, `bifrost`, `os install/uninstall` remain on the legacy `cstar.ts` CLI.
- **Generic skill dispatch** — a `run_skill` tool would violate the Host-Native Skill Mandate. Use per-skill MCP tools or host-native `SKILL.md` execution.
