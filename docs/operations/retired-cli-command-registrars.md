# Retired CLI command registrars

The canonical `cstar.ts` inspection CLI exposes `status`, `manifest`,
`skill-info`, `trace`, and `augury`. Lifecycle, Hall, Forge, spoke, profile,
provider, and host-integration work belongs to typed CStar surfaces with the
applicable operator gate.

Legacy exported registrars remain import-compatible only so stale consumers
receive deterministic failures. Registration does not resolve a workspace.
Parsing does not read or write Hall/state, inspect secrets, touch files or host
hooks, mutate environment variables, spawn a process, invoke a provider, or
call a supplied dispatch callback.

| Family | Stable failure |
| --- | --- |
| Python launchers | `legacy_python_command_registrars_retired_use_cstar_kernel` |
| Vitals | `legacy_vitals_command_retired_use_cstar_status` |
| One Mind | `legacy_one_mind_command_retired_use_cstar_kernel` |
| Hall documents | `legacy_hall_document_command_retired_use_cstar_kernel` |
| Spokes | `legacy_spoke_command_retired_use_cstar_kernel` |
| OS integration | `legacy_os_integration_command_retired_requires_operator_gate` |
| Oracle | `legacy_oracle_command_retired_use_authorized_researcher` |
| TUI registration | `legacy_tui_command_retired_use_cstar_status` |
| Beads | `legacy_bead_command_retired_use_cstar_kernel` |
| Profile command | `legacy_profile_command_retired_requires_supported_profile_surface` |
| Profile persistence | `legacy_profile_persistence_retired_requires_supported_profile_surface` |
| Secret store and loans | `legacy_secret_store_retired_requires_request_scoped_operator_gate` |
| Bifrost | `legacy_bifrost_command_retired_use_cstar_manifest` |
| Start | `legacy_start_command_retired_use_cstar_kernel` |
| Ravens | `legacy_ravens_command_retired_use_cstar_kernel` |
| PennyOne | `legacy_pennyone_command_retired_use_cstar_kernel` |

The legacy operator TUI input parser permits passive refresh, navigation,
clear, and exit only. Every action-bearing input returns
`legacy_tui_action_retired_use_cstar_kernel` without dispatch or callbacks.

`command_catalog.ts` is static metadata and never constructs Commander trees.
`command_context.ts` is output-only; synthetic result metadata cannot update
planning sessions or beads.

The legacy SessionStart hook and `profile-digest.mjs` entrypoint are silent
compatibility tombstones. They do not choose a user, read environment identity,
open Hall, enumerate secret-reference services, access a keyring, or inject
context. Profile persistence and secret-loan functions also fail before touching
their supplied database, callback, or any dynamically loaded provider. The
pure `buildProfileDigest` formatter remains available only for synthetic,
caller-supplied data and has no runtime discovery path.

Focused proof lives in:

- `tests/unit/test_retired_action_command_registrars.test.ts`
- `tests/unit/test_command_catalog.test.ts`
- `tests/unit/test_command_context.test.ts`
- `tests/unit/node-runtime/test_operator_tui_provider_boundary.test.ts`

This is source-level development evidence. It is not an installed-runtime,
activation, deployment, or production-readiness claim.
