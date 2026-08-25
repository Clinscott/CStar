# Codex MCP Contract

This is the authoritative Codex integration contract for Corvus Star.

If any generated README, plugin skill, installer message, or older prose disagrees with this file, follow this file.

## Supported Runtime Surface

Corvus Star supports exactly one Codex runtime integration surface:

1. `cstar-kernel`
   The only supported Codex MCP server for Corvus Star.
   Scope: bounded kernel primitives only.
   Default operator profile (exactly 16 tools):
   - `cstar_handoff`
   - `cstar_hall_search`
   - `cstar_augury`
   - `cstar_doctor`
   - `cstar_verify_plan`
   - `cstar_bead`
   - `cstar_goal_resume`
   - `cstar_record_result`
   - `cstar_manifest`
   - `cstar_skill_info`
   - `cstar_status`
   - `cstar_persona_set`
   - `cstar_researcher_request`
   - `cstar_forge_request`
   - `cstar_forge_authorize`
   - `cstar_forge_execute`

   The advanced profile adds exactly nine tools:
   `cstar_spoke_bead_import`, `cstar_engram_record`,
   `cstar_war_game_score`, `cstar_spoke_journal`,
   `cstar_pennyone_context`, `cstar_evolve`, `cstar_spoke`, `cstar_warden`,
   and `cstar_telemetry`.

   The three compatibility-only tools are `cstar_hall_maintenance`,
   `cstar_mongo_mailbox`, and `cstar_intent_route`. The explicit full
   compatibility profile registers all 28 tools. Its discovery delta contains
   the 12 non-default tools: the nine advanced tools plus these three
   compatibility surfaces.

The exhaustive API reference is `docs/integrations/cstar-kernel-mcp.md`. If a
tool inventory test and this list disagree, fix the prose; runtime registration
and the integration test are the authoritative inventory.

## Canonical SET and Forge Flow

`cstar_augury` is mode-dependent. Omitting `mission_boundary` is advisory and
read-only. A new current exact `SET`/design supplies exactly one strict
`mission_boundary`, preferring v2 while retaining v1 compatibility. That
materializes the ordered mission and immutable child request templates.

The active implementation flow is:

`one cstar_augury mission_boundary -> cstar_forge_request ->
cstar_forge_authorize -> cstar_forge_execute -> independent
cstar_record_result -> automatic next-child advancement`

For an eligible child, `cstar_forge_request` may derive request-scoped evidence
from the exact SET mission grant. The default operator still calls
`cstar_forge_authorize` as the explicit no-spend authorization gate; the tool
also retains compatibility behavior for unchanged eligible legacy requests.
`cstar_intent_route`, One Mind, and Weave are not active routing surfaces.

## MCP 2026-07-28 Readiness Rule

Codex should treat the current stdio `initialize` handshake as transport
compatibility only. It is not a CStar application session.

Future MCP transports must keep CStar tool calls self-contained:
- protocol version, client metadata, trace context, and transport routing belong
  in MCP request metadata/headers, not in CStar tool arguments
- cross-call continuity belongs in explicit CStar handles such as `bead_id`,
  `validation_id`, `spoke`, `memory_id`, or the immutable event returned by
  `cstar_goal_resume`
- Roots, Sampling, and Logging must not be introduced as Codex MCP dependencies;
  use tool parameters, host-native provider integration, stderr/bootstrap logs,
  and CStar telemetry instead
- Tasks and MCP Apps are optional future extensions; they must not replace Hall
  bead authority or expand `cstar-kernel` into host cognition

### Quarantined TokenPath result coupling

`cstar_record_result` has no TokenPath input or response fields. Unknown legacy
fields are ignored by the MCP schema and cannot append, persist, promote, or
auto-link an observation. A future observed pipeline requires a separately
authorized, causally identified promotion contract; no generic result call,
sidecar file, or missing-install fallback grants current authority.

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

## Data Surface Rule

`cstar-kernel` may expose bounded data surfaces only when they preserve CStar
authority:
- PennyOne/Hall is the source-of-truth context surface for bead, validation,
  repository, and project-state summaries.
- Mongo is a mailbox/cache/mirror surface for dashboards and host processes,
  not the source of truth for bead lifecycle state.
- Tools must expose named actions with schema-validated arguments. Do not add
  arbitrary SQL, arbitrary Mongo queries, caller-selected collection names, or
  direct Hall/SQLite bypasses.
- Mutating mailbox actions require explicit operator authorization references
  and must emit small auditable receipts.

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

Codex Desktop-on-WSL should load `cstar-kernel` through
`/home/morderith/.codex/bin/wsl/cstar-kernel-mcp-wrapper`, and that wrapper must
launch `bin/cstar-kernel-mcp.js` directly over stdio. The former bridge and TCP
daemon are retirement tombstones; neither reconnects, listens, spawns a child,
or falls back to another transport. Changing the live wrapper still requires a
separately authorized activation and restart window.

Use shell `./cstar ...` only when MCP does not expose the needed primitive or the capability is explicitly terminal-required.

## Drift Handling

Drift should be reported by `cstar_doctor`, converted into a bounded repair
item, and proven after a separately authorized supported-plugin activation and
restart window. Source code does not auto-install, self-heal, invoke a launcher,
or write `.agents/state` activity sidecars.

The former self-heal, launcher smoke, ambient Codex activity writer, Gemini
symlink installer, and local genesis setup paths are retirement tombstones.
Their stable failures are:

- `legacy_codex_self_heal_retired_requires_operator_gated_supported_plugin_surface`
- `legacy_codex_launcher_smoke_retired_use_cstar_doctor_and_live_runtime_proof`
- `legacy_codex_cli_activity_sidecar_retired_use_host_runtime_receipt`
- `direct_gemini_extension_install_retired_requires_supported_host_surface`
- `direct_local_setup_retired_requires_operator_gated_supported_installer`

None reads host config, marketplace state, environment contents, or credentials;
none writes a cache, symlink, environment, log, or package; and none starts a
process. Installation and restart remain distinct operator gates.

The compatibility-named `installCodexPlugin` helper is instead a bounded source
stager. It requires one pre-existing approved local marketplace entry, verifies
the generated plugin lineage, and may write only the personal plugin source
tree. It does not mutate marketplace or Codex cache state, invoke `codex plugin
add`, activate the plugin, restart the host, or prove live runtime. Staging,
installation, activation, restart, and production therefore remain distinct
authority effects.

## Simplification Rule

When simplifying Codex integration, prefer:
- fewer MCP servers
- fewer startup surfaces
- fewer duplicated instructions
- one runtime truth

Do not add a second supported Codex MCP server unless `cstar-kernel` cannot express a bounded primitive that materially improves operations.
