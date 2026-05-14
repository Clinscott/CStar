# cstar-kernel MCP — API Reference

> The authoritative kernel surface for Corvus Star. Every tool is deterministic — no LLM inference inside the tool execution path. Host agents (Claude, Gemini, Codex) call these tools directly over MCP rather than shelling out to `./cstar`.

## Source of Truth

- **Server:** `bin/cstar-kernel-mcp.js` → `src/tools/cstar-kernel-mcp.ts`
- **Registration site:** `server.tool(...)` calls in `cstar-kernel-mcp.ts`
- **Server name:** `cstar-kernel`
- **Transport:** stdio (JSON-RPC 2.0, newline-delimited)
- **Protocol version:** `2024-11-05`
- **Registry shipped to hosts:** `gemini-extension.json#mcpServers` (Gemini) and `plugins/corvus-star/.mcp.json` (Codex)

The driver `bin/cstar-kernel-mcp.js` re-execs Node with the TSX loader against `src/tools/cstar-kernel-mcp.ts`. The server keeps stdin open and exits cleanly on `SIGTERM` or stdin close.

## Operational Mandates

1. **Host-Agent Run First.** MCP handlers wrap deterministic work only. Any LLM inference per iteration must be driven by the host agent or a spawned sub-agent — never by an MCP tool calling back out to an LLM.
2. **Registry outranks prose.** When in-tree docs disagree with `.agents/skill_registry.json` or the runtime, follow the registry/runtime.
3. **Authority order for capability discovery.** `cstar_manifest` and `cstar_skill_info` are the canonical surfaces. Spoke skills are namespaced `<slug>:<id>`.
4. **Bead anchoring.** Multi-file changes anchor to a Hall bead via `cstar_bead`. The `cstar_handoff` tool returns the active planning state for resuming work.

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

---

## Tool Inventory (20)

| # | Tool | Tier |
|:---|:---|:---|
| 1 | `cstar_handoff` | Active state |
| 2 | `cstar_hall_search` | Discovery |
| 3 | `cstar_hall_maintenance` | Discovery |
| 4 | `cstar_augury` | Routing |
| 5 | `cstar_doctor` | Diagnostics |
| 6 | `cstar_verify_plan` | Verification |
| 7 | `cstar_bead` | Bead lifecycle |
| 8 | `cstar_spoke_bead_import` | Bead lifecycle |
| 9 | `cstar_record_result` | Verification |
| 10 | `cstar_engram_record` | Memory write |
| 11 | `cstar_war_game_score` | War games |
| 12 | `cstar_manifest` | Capability discovery |
| 13 | `cstar_skill_info` | Capability discovery |
| 14 | `cstar_spoke_journal` | Spoke state |
| 15 | `cstar_status` | Diagnostics |
| 16 | `cstar_evolve` | Karpathy loop (read-only) |
| 17 | `cstar_spoke` | Spoke lifecycle |
| 18 | `cstar_intent_route` | Routing |
| 19 | `cstar_warden` | Sentinel Wardens |
| 20 | `cstar_telemetry` | Diagnostics |

---

## 1. `cstar_handoff`

Compact active state from Augury/handoff logic. Returns `{ status: 'idle' }` when there is no active session.

**Input:** _(none)_

**Output (active):**
```json
{
  "execution_gate": "READY",
  "phase": "FORGE",
  "next_action": "<imperative>",
  "lead_bead_id": "bead:...",
  "target_paths": ["<path>", "..."],
  "checker_shells": ["<command>", "..."],
  "work_items": [{ "bead_id": "...", "status": "IN_PROGRESS", "target_path": "..." }]
}
```

## 2. `cstar_hall_search`

Bounded FTS5 search across `CODE / DOC / ENGRAM / BEAD / SESSION / LESSON`.

**Input:**
- `query` (string, required) — search text
- `limit` (number, optional, 1..10, default 5)
- `types` (string[], optional) — subset of `['CODE','DOC','ENGRAM','BEAD','SESSION','LESSON']`

**Output:** array of `{ type, path_or_id, title, summary, rank }`.

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
  "reason": "...",
  "bead_id": "bead:...",
  "target_paths": ["..."],
  "last_validation": { "verdict": "SUCCESS", "recorded_at": 1700000000000, "validation_id": "val-..." }
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
- `assigned_agent`, `resolution_note`, `triage_reason`, `resolved_validation_id`, `contract_refs`, `metadata`
- `spoke` (string, optional) — anchor the bead to a registered spoke's repo_id

**Output:** `{ status: 'created'|'claimed'|'resolved'|'blocked'|'updated'|'ok', bead: {...} }` or `{ status: 'ok', count, beads: [...] }` for list.

## 8. `cstar_spoke_bead_import`

Rich Bead-import surface for spokes. Hard-rejects unregistered, inactive, quarantined, or read-only spokes.

**Input (selected required):**
- `spoke` (string) — registered spoke slug
- `intent`, `acceptance_criteria` (strings)
- `lore_path` (string) — Gherkin .feature file, must exist on disk

**Optional:** `bead_id`, `design_doc_path`, `wireframe_ref`, `threat_model_summary`, `contract_refs`, `checker_shell`, `target_paths`, `target_kind`, `target_ref`, `augury_block`, `assigned_agent`, `status`, `metadata`.

## 9. `cstar_record_result`

Append validation outcome and optionally connect it to a bead. Feeds the Augury token-path sidecar calibration loop.

**Input:**
- `bead_id` (string, required)
- `verdict` (enum: `ACCEPTED|REJECTED|INCONCLUSIVE|SUCCESS|FAILURE`, required)
- `notes` (string, optional)
- `token_path_episode_id` (string, optional) — episode id from a prior `cstar_augury` response
- `token_path_observation` (object, optional) — scenario_class + selected_policy + observed_tokens for sidecar calibration

## 10. `cstar_engram_record`

Publish an Engram to the Hall. Spokes use this as the dead-drop write surface for cross-system events. Fires `cstar_war_game_score` if intent matches a registered contest defender prefix.

**Input:**
- `intent` (string, required)
- `bead_id` (string, required)
- `spoke` (string, optional) — must be active/trusted/read_write
- `metadata` (object, optional)
- `memory_id` (string, optional)

## 11. `cstar_war_game_score`

War-game scoring. Actions: `register_contest`, `tally`, `recent`, `by_scenario`, `get_score`, `list_contests`. Scoring fires automatically when `cstar_engram_record` receives an Engram whose intent matches a registered contest defender prefix.

**Input:** `action` (enum), plus action-specific fields (see `tests/integration/war_game_scoring.test.ts` for full examples).

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

## 15. `cstar_status`

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

## 16. `cstar_evolve`

Read-only inspection of evolve proposals and SPRT history. Proposal generation and adversarial critique are LLM-driven and stay host-native (not exposed here).

**Input:**
- `action` ("list_proposals" | "get_proposal" | "list_sprt_history", required)
- `proposal_id` (string, required for get_proposal; must match `[a-zA-Z0-9._-]+`, no path components)
- `limit` (number, optional, 1..100)

**Path-traversal guard:** `proposal_id` is rejected if it contains `/`, `\`, or `..`. Maximum proposal size: 512 KB.

## 17. `cstar_spoke`

Mounted-spoke lifecycle. Completes the spoke surface alongside `cstar_spoke_journal` and `cstar_spoke_bead_import`.

**Input:**
- `action` ("list" | "link" | "unlink" | "inspect", required)
- `slug` (string, required for link/unlink/inspect; normalized to `[a-z0-9._-]+`, 1..64 chars)
- `root_path` (string, required for link) — absolute or relative
- `kind` ("local"|"git"|"mirror"|"archive", optional, default "local")
- `remote_url`, `branch`, `trust_level`, `write_policy` (optional, link only)
- `accept_beads` (boolean, optional) — shortcut: forces trust=trusted, write_policy=read_write

**Output (link):** `{ status: 'linked'|'relinked', slug, root_path, trust_level, write_policy, created_at }`. Re-linking an existing slug preserves `created_at` and merges existing metadata.

## 18. `cstar_intent_route`

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
  "match_count": 2,
  "matches": [
    { "intent_category": "BUILD", "default_path": "creation_loop", "tier": "WEAVE", "matched_triggers": ["build"] },
    { "intent_category": "OBSERVE", "default_path": "scan", "tier": "PRIME", "matched_triggers": ["status", "check"] }
  ]
}
```

`grammar_source: "fallback"` means the registry failed to load and the in-code defaults from `src/node/core/runtime/host_workflows/chant_parser.ts#INTENT_CATEGORIES` were used.

## 19. `cstar_warden`

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

## 20. `cstar_telemetry`

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
  "token_path": { "advisor_available": false, "advice_count_24h": 0 }
}
```

---

## Invocation Examples

### From an MCP-aware host (Claude / Gemini / Codex)
Invoke directly via the MCP protocol — the host's tool-call mechanism wraps the JSON-RPC frames automatically. The tools above are listed under the `cstar-kernel` server.

### From a raw JSON-RPC client
After the standard `initialize` + `notifications/initialized` handshake:

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

## Adding a New Tool

1. Add a `server.tool('cstar_<name>', '<description>', { /* Zod schema */ }, instrumentTool('cstar_<name>', handler))` registration in `src/tools/cstar-kernel-mcp.ts`.
2. Add a `{ name, purpose }` entry to `KERNEL_MCP_TOOLS` in `src/packaging/distributions.ts` (this propagates into `GEMINI.md` and the Codex `SKILL.md` on the next `npm run build:distributions`).
3. Add an entry to this file in tool-number order.
4. Add unit tests in `tests/unit/test_cstar_kernel_mcp.test.ts`.
5. Add an assertion to the stdio integration test's "expected tools" list in `tests/integration/cstar_kernel_mcp_stdio.test.ts`.
6. Run `npm run test:node` and `npm run validate:distributions` before committing.

## What Does Not Belong on This Surface

- **LLM inference per iteration** — proposal generation, critique, oracle sampling, autonomous mutation. These stay host-native.
- **Terminal-bound flows** — `start`, `tui`, `ravens`, `bifrost`, `os install/uninstall` remain on the legacy `cstar.ts` CLI.
- **Generic skill dispatch** — a `run_skill` tool would violate the Host-Native Skill Mandate. Use per-skill MCP tools or host-native `SKILL.md` execution.
