# CStar MCP Kernel Transition Review

## Verdict

Proceed only if the MCP becomes a tiny kernel server. Scrap the transition if it becomes another host-control layer.

The current MCP surfaces are too broad for the base kernel. They expose host sampling, background scans, arbitrary workflow execution, story/code forge, persona switching, telemetry HUDs, and formatted lore output. Carrying that forward would increase context bloat and maintenance.

## Current Surfaces

The legacy MCP servers (`pennyone` and `corvus-control`) have been removed. Source archived under `mind_archive/legacy_mcp_source/` for audit trail:

- `mind_archive/legacy_mcp_source/pennyone-mcp-server.ts` (was `src/tools/pennyone/mcp-server.ts`)
- `mind_archive/legacy_mcp_source/corvus-control-mcp.ts` (was `src/tools/corvus-control-mcp.ts`)

Original exposed tool count: 16.

High-risk current tools:

- `think`
- `consult_oracle`
- `index_sector`
- `scan_repository`
- `switch_persona`
- `artifact_forge`
- `taliesin_forge`
- `execute_cstar_command`
- `run_workflow`
- `get_system_vitals`
- `verify_sterling_compliance`
- `get_mcp_documentation`

These should not survive the base-kernel MCP. They either call the host, mutate in the background, execute arbitrary workflows, return formatted prose, or preserve non-kernel ceremony.

## Surviving Kernel

The MCP transition should expose a compact kernel surface:

1. `cstar_handoff`
2. `cstar_hall_search`
3. `cstar_augury`
4. `cstar_doctor`
5. `cstar_verify_plan`
6. `cstar_bead`
7. `cstar_record_result`

No legacy `pennyone` or `corvus-control` tools should ship in the default host surface.

## Tool Contracts

### `cstar_handoff`

Purpose: Return compact active state.

Source:

- `buildTraceHandoffPayload`
- active planning/runtime resolution in `src/node/core/commands/trace.ts`

Output limit:

- One active gate.
- One next action.
- One lead bead.
- Up to 5 target paths.
- Up to 3 checker commands.
- Up to 3 work items.

No prose banners. No rendered line output.

### `cstar_hall_search`

Purpose: Return bounded memory hits.

Source:

- `searchIntents`
- `getHallBead`
- `getHallBeads`
- `listHallPlanningSessions`

Inputs:

- `query`
- `limit`, default `5`, max `10`
- optional `types`: `CODE`, `DOC`, `ENGRAM`, `BEAD`, `SESSION`

Output:

- `type`
- `path_or_id`
- `title`
- `summary`, max 240 characters
- `rank`
- optional `status`
- optional `updated_at`

No file contents. No full Hall dumps. No banners.

### `cstar_augury`

Purpose: Route one mission without claiming host pre-inference control.

Inputs:

- `prompt`
- optional `inferred_intent`
- optional `target_paths`
- optional `scope`

Output:

- `intent_category`
- `intent`
- `scope`
- `selection`
- `expert`
- `mimir_targets`, max 3
- `next_action`
- `confidence`
- optional `token_path` advice from the AuguryTokenPath sidecar
- optional `token_path.episode_id` for later outcome correlation

This may reuse Augury contract logic, but must return compact JSON only. Token Path is intentionally attached here as routing advice, not invoked from every MCP tool.

### `cstar_doctor`

Purpose: Diagnose base kernel health.

Source:

- `buildAuguryDoctorPayload`
- Hall DB availability checks

Output:

- `status`
- `score`
- `warnings`, max 5
- `active`
- `checks`
- `telemetry`
- `usefulness`
- `token_path`

No formatted console rendering.

### `cstar_verify_plan`

Purpose: Recommend focused verification without running it.

Sources:

- lead bead `checker_shell`
- handoff `checker_shells`
- validation history from `getValidationRuns`

Output:

- `recommended_commands`, max 3
- `reason`
- `bead_id`
- `target_paths`
- `last_validation`

It should not execute shell commands.

### `cstar_bead`

Purpose: Manage bounded Hall bead state without exposing broad Hall mutation.

Source:

- `getHallBead`
- `getHallBeads`
- `upsertHallBead`

Inputs:

- `action`: `get`, `list`, `create`, `update_status`, `claim`, `resolve`, or `block`
- optional bead fields needed by the selected action
- `limit`, default `5`, max `10` for list
- optional `statuses` filter for list

Output:

- `status`
- `action`
- compact `bead` or `beads`

This is the bead control surface. It must preserve existing bead fields on status transitions and must not expose arbitrary SQL, broad ledger dumps, or shell execution.

### `cstar_record_result`

Purpose: Append an explicit outcome.

Source:

- `saveValidationRun`
- optional token-path observation append

Inputs:

- `bead_id`
- `verdict`: `ACCEPTED`, `REJECTED`, `INCONCLUSIVE`, `SUCCESS`, or `FAILURE`
- `notes`
- optional `token_path_episode_id`
- optional `token_path_observation`

Output:

- `validation_id`
- `bead_id`
- `verdict`
- optional `token_path_episode_id`
- optional `token_path_observation_id`

This records evidence. Bead state transitions belong in `cstar_bead`. When a `token_path_episode_id` is provided, the tool can auto-link the recent `cstar_augury` advice into a sidecar observation; explicit `token_path_observation` remains supported for richer calibration data.

## Implementation Shape

Create a new server rather than expanding the current two:

- `src/tools/cstar-kernel-mcp.ts`
- `bin/cstar-kernel-mcp.js`

Leave `pennyone` and `corvus-control` available only as legacy surfaces during review. Do not install them by default for the reduced kernel.

The new server should import core functions directly. It should not shell out to `cstar` except as a last-resort compatibility path, and first-pass tools should not need that compatibility path.

## Context Rules

- Tool descriptions must be one sentence.
- Tool outputs must be compact JSON.
- Defaults must return no more than 5 records.
- Hard maximum result count is 10.
- Summaries must be truncated.
- No ANSI, banners, persona names, lore framing, or markdown tables.
- No host sampling.
- No arbitrary command execution.
- No background jobs.
- No silent hooks.

## Scrap Conditions

Scrap the MCP transition if any of these become necessary:

- Broad legacy tool surfaces instead of compact bounded kernel tools.
- Any tool needs host sampling to answer basic state questions.
- Any tool returns full files, full ledgers, or rendered terminal output.
- Any tool executes arbitrary shell/workflow commands.
- Any host needs a custom fork of the tool contract.
- Session startup requires more than `cstar_handoff` plus one `cstar_hall_search`.

## Migration Sequence

1. Build `cstar-kernel-mcp` with read-only tools: handoff, hall search, augury, doctor, verify plan. ✅
2. Add `cstar_record_result`. ✅
3. Add bounded bead control through `cstar_bead`. ✅
4. Point Codex/Gemini/Claude to only the kernel MCP. ✅
5. Remove default installation of legacy `pennyone` and `corvus-control` MCP servers. ✅ (source archived under `mind_archive/legacy_mcp_source/`)
6. Legacy servers archived in `mind_archive/legacy_mcp_source/`; restoration would require resurrecting and re-registering them.

## Recommendation

Build the kernel MCP. Do not migrate the current MCPs as-is.

If the reduced server cannot stay within the compact kernel contract, CStar should not become an MCP. In that case, keep the base kernel as CLI plus docs, or archive CStar entirely.
