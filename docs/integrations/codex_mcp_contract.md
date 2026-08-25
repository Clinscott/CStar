# Codex MCP Contract

This is the authoritative Codex integration contract for Corvus Star.

If any generated README, plugin skill, installer message, or older prose disagrees with this file, follow this file.

## Supported Runtime Surface

Corvus Star supports exactly one Codex runtime integration surface:

1. `cstar-kernel`
   The only supported Codex MCP server for Corvus Star.
   Scope: bounded kernel primitives only.

The checked, exhaustive API reference is
`docs/integrations/cstar-kernel-mcp.md`. Tool names and descriptions come from
the typed kernel catalog and are proven against runtime registration and stdio
discovery. Do not duplicate that inventory in this contract or in host prose.

## Codex Registration Lineage

The supported Codex Desktop-on-WSL lineage is:

1. the global `cstar-kernel` entry in `~/.codex/config.toml`
2. `/home/morderith/.codex/bin/wsl/cstar-kernel-mcp-wrapper`
3. `/home/morderith/Corvus/CStar/bin/cstar-kernel-mcp.js`

This lineage is direct stdio only. `bin/cstar-kernel-mcp-bridge.js` is a
compatibility entrypoint that may launch the same direct stdio child, but it is
not part of the supported Codex registration. TCP mode and
`scripts/cstar-mcp-tcp-daemon.js` are retired and fail closed; no loopback
listener is an authorized CStar transport. Spawn-retaining launchers relay
`SIGINT` and `SIGTERM` to their child and escalate after a bounded grace period
so a stopped parent cannot leave a stale source child behind.

This is a local single-user integration. Thread ids inherited by the stdio
child and hashes verified against the Codex session store provide provenance
inside the operator's account, not cryptographic isolation from another process
running under the same UID. Same-UID processes with session-store access are
part of the trusted computing base. A hostile-local or multi-user deployment
must add an OS-enforced peer identity or authenticated transport before relying
on operator-attestation gates.

Tracked project configuration under `/home/morderith/Corvus/.codex/` must not
register or override `cstar-kernel`. The Corvus Star Codex plugin is a
skill-only package; it must not contain an MCP registration or lifecycle hook.
Generic MCP
and Gemini extension configuration are separate host surfaces and do not
replace the Codex lineage above.

Every MCP child launched through the supported Codex wrapper lineage or
the generated Gemini extension launcher is host-neutral. Those launchers scrub
passive Codex identity/state variables, seed known Gemini, Codex, Claude, Droid,
agent-mode, and Corvus authority markers with explicit inactive sentinels, and
set `CORVUS_HOST_SESSION_ACTIVE=0`. The TypeScript MCP entry reapplies that
neutralization after its dotenv load; Python bootstrap does the same before
`EnvAdapter`, whose explicit inactive sentinel resolves to `HEADLESS` before
any subagent or interactive-host checks. Scrubbing uses an audited explicit key
set, not a `CODEX_*` wildcard: unknown Codex variables may carry sandbox,
network, or other fail-closed constraints and are preserved. Any new host
authority marker must be explicitly classified, neutralized, and covered by
the launched-child probes before activation. `CSTAR_KERNEL_MCP=1` identifies the
bounded tool server; it does not grant interactive host authority. Generic
`.mcp.json` files are separate, currently unverified surfaces and are not
covered by this claim.

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

### Quarantined `token_path_observation` contract

The schema retains an optional `token_path_observation` object for compatibility,
but observation acceptance and advice are disabled. A supplied observation is
reported as quarantined and performs no TokenPath write or validation-state
change. Re-enabling it requires a promoted, versioned episode source, measured
token and round fields, independent outcome validation, and holdout evidence;
caller-provided confidence or reconstructed advice is never sufficient.

## Explicit Non-Goal

`cstar-kernel` is a bounded Corvus control-plane surface, not a general shell or
host-cognition proxy.

It must stay narrow:
- health
- handoff
- bounded Hall search
- bounded Augury routing
- verification hints
- validation/result recording
- explicit bead/spoke/capability lifecycle primitives that preserve the
  Host-Native First contract

Do not expand it into a shell-dispatch surface or host-cognition proxy.
`cstar_forge_execute` is explicitly classified EXECUTION. Live mode is allowed
only after `cstar_forge_request` persists an immutable Hall request, binds a
one-shot current-thread operator attestation, locks the exact package/target/
required-output contract, and atomically reserves one attempt. Adapter delivery
is evidence only; independent `cstar_record_result` validation finalizes success
or failure. Caller-supplied reference strings are never authority.

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

## Bounded Codex Startup Checks

Inside Corvus or a Corvus spoke, launch plain `codex`, then run only the checks
needed for the current state:

- use `cstar_doctor` when kernel health is unknown or a probe reports degradation
- use `cstar_handoff` when resuming prior planning or execution state
- use `cstar_augury` when route or material scope is ambiguous
- use at most one broad, bounded `cstar_hall_search` only when discovery needs
  it, then narrow by bead, path, or error

None of these is a per-prompt ritual. Reuse fresh, matching state.

Codex Desktop-on-WSL loads `cstar-kernel` through the direct-stdio registration
lineage defined above. A source change is not live in an already-running Codex
process until the operator restarts or otherwise reloads that process.

Use shell `./cstar ...` only when MCP does not expose the needed primitive or the capability is explicitly terminal-required.

## Source Repair and Activation Boundary

Tracked-source validation proves only the source contract. It does not mutate
or prove the global Codex configuration, installed plugin, marketplace/cache,
legacy running processes, or the active Codex app-server.

There is no supported source-tree self-heal command for this boundary. A
single local script cannot honestly repair global configuration, reconcile the
Codex marketplace/cache through supported host operations, restart Desktop,
and prove effective live precedence.

The registered `cstar-closeout` skill provides a read-only preflight at
`.agents/skills/cstar-closeout/scripts/inspect_codex_activation.py`. It may
inspect source lineage, personal staging, installed cache lineage, marketplace
uniqueness, and static MCP wrapper precedence. It performs no activation and
must always report live proof as unperformed. The retired
`scripts/codex_launcher_smoke.ts` is not an activation check and must not be
revived.

Activation is a separate operator-gated operation. It must back up host state,
reconcile the global wrapper registration and plugin installation through
supported Codex surfaces, stop any retired TCP daemon under an explicit process
gate, restart Codex, and then prove all of the following:

- effective configuration from the home, Corvus, and CStar roots selects the
  same global wrapper
- one installed plugin lineage matches its recorded source hashes
- the app-server reaches the global wrapper and direct source launcher rather
  than a project-owned override
- no retired CStar TCP listener or daemon remains active
- newly spawned direct-stdio children are host-neutral
- live `cstar_doctor` and tool discovery match the checked source catalog

If the preflight reports more than one root with the same marketplace name,
fail closed before `codex plugin add`: the installed Codex CLI rejects a plugin
selector that matches multiple marketplace roots. Back up the user config,
global wrapper, personal plugin source, and configured marketplace cache; then
use the supported Codex plugin and marketplace removal surfaces to reconcile to
one root before reinstalling. Stop after any unexpected mutation result and
restore from the backup with Codex stopped. Do not silently hand-edit around a
marketplace conflict.

Until those probes pass, report the repair as source-verified, not activated.

## Simplification Rule

When simplifying Codex integration, prefer:
- fewer MCP servers
- fewer startup surfaces
- fewer duplicated instructions
- one runtime truth

Do not add a second supported Codex MCP server unless `cstar-kernel` cannot express a bounded primitive that materially improves operations.
