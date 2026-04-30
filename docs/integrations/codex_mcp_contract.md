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
   - `cstar_augury`
   - `cstar_verify_plan`
   - `cstar_record_result`

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
