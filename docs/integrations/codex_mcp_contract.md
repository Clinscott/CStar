# Codex MCP Contract

This is the authoritative Codex integration contract for Corvus Star.

If any generated README, plugin skill, installer message, or older prose disagrees with this file, follow this file.

## Supported Runtime Surface

Corvus Star supports exactly one Codex runtime integration surface:

1. `cstar-kernel`
   The only supported Codex MCP server for Corvus Star.
   Scope: bounded kernel primitives only.
   Tools:
   - `cstar_doctor`
   - `cstar_handoff`
   - `cstar_hall_search`
   - `cstar_hall_maintenance`
   - `cstar_augury`
   - `cstar_verify_plan`
   - `cstar_bead`
   - `cstar_spoke_bead_import`
   - `cstar_record_result`
   - `cstar_engram_record`
   - `cstar_war_game_score`
   - `cstar_manifest`
   - `cstar_skill_info`
   - `cstar_spoke_journal`
   - `cstar_status`
   - `cstar_evolve`
   - `cstar_spoke`
   - `cstar_intent_route`
   - `cstar_warden`
   - `cstar_telemetry`

The exhaustive API reference is `docs/integrations/cstar-kernel-mcp.md`. If a
tool inventory test and this list disagree, fix the prose; runtime registration
and the integration test are the authoritative inventory.

## MCP 2026-07-28 Readiness Rule

Codex should treat the current stdio `initialize` handshake as transport
compatibility only. It is not a CStar application session.

Future MCP transports must keep CStar tool calls self-contained:
- protocol version, client metadata, trace context, and transport routing belong
  in MCP request metadata/headers, not in CStar tool arguments
- cross-call continuity belongs in explicit CStar handles such as `bead_id`,
  `validation_id`, `spoke`, `memory_id`, or `token_path_episode_id`
- Roots, Sampling, and Logging must not be introduced as Codex MCP dependencies;
  use tool parameters, host-native provider integration, stderr/bootstrap logs,
  and CStar telemetry instead
- Tasks and MCP Apps are optional future extensions; they must not replace Hall
  bead authority or expand `cstar-kernel` into host cognition

### Optional `token_path_observation` (v3.1+)

`cstar_record_result` accepts an optional `token_path_observation` object. When supplied,
the kernel appends the observation to
`.agents/state/augury-token-path-mcp-observations.jsonl` for the AuguryTokenPath sidecar
calibration loop. Required keys when present: `scenario_class`, `selected_policy`,
`advised_mode`. All other keys (`observed_raw_tokens_episode`,
`observed_billable_tokens_episode`, `rounds`, `verification_result`,
`terminal_outcome`, `notes`) are optional.

If the sidecar is not installed, the field is silently dropped — observations land in the
JSONL file regardless. Hosts may always omit `token_path_observation`; doing so does not
change the kernel's behavior.

## Optional Maintenance Surface

`corvus-codex` is optional.

It is a convenience launcher for startup self-heal, loud drift reporting, and handoff to the real `codex` binary. It is not required for steady-state Corvus operation.

## Explicit Non-Goal

`cstar-kernel` is not a general Corvus control plane.

It must stay narrow:
- health
- handoff
- bounded Hall search
- bounded Augury routing
- verification hints
- validation/result recording
- explicit bead/spoke/capability lifecycle primitives that preserve the
  Host-Native First contract

Do not expand it into a shell-dispatch surface, workflow forge surface, or host-cognition proxy.

## Legacy Surface

`corvus-control-mcp` and `pennyone-mcp` have been removed.

Source archived under `mind_archive/legacy_mcp_source/` for audit trail. They are not part of any supported startup path and must not be revived as a competing authority to `cstar-kernel`.

Reason:
- they mixed MCP with shell `run-skill` execution
- they conflicted with the host-native contract
- they increased surface area without improving the bounded host path

## Default Codex Startup Order

Inside Corvus or a Corvus spoke:

1. launch plain `codex`
2. use `cstar_doctor`
3. use `cstar_handoff`
4. use one bounded `cstar_hall_search`

Use `corvus-codex` only when you explicitly want startup repair or verbose drift reporting before Codex launches.

Use shell `./cstar ...` only when MCP does not expose the needed primitive or the capability is explicitly terminal-required.

## Drift Handling

Drift should warn loudly, attempt repair, and then report degraded mode if repair fails.

Operational commands:
- `npm run codex:self-heal`
- `npm run codex:smoke`

Persistent logs:
- `.agents/state/codex-self-heal.jsonl`
- `.agents/state/codex-launcher-smoke.jsonl`

## Simplification Rule

When simplifying Codex integration, prefer:
- fewer MCP servers
- fewer startup surfaces
- fewer duplicated instructions
- one runtime truth

Do not add a second supported Codex MCP server unless `cstar-kernel` cannot express a bounded primitive that materially improves operations.
