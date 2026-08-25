# CStar Kernel Secret-Environment Boundary

This allowlist also carries the explicit code/control binding.
`CSTAR_CODE_ROOT` and `CSTAR_CONTROL_ROOT` are override-only launcher values;
they are never ambient-copied into the child. The legacy project/workspace
aliases are set to the validated control root. Root and Forge-readiness details
live in `docs/operations/cstar-kernel-code-control-root-boundary.md`.

The supported direct-stdio launcher constructs the kernel process environment
from an explicit allowlist. It never copies the parent environment wholesale
and the TypeScript kernel does not load a project `.env` file.

The allowlist preserves only the operating-system values needed to start the
runtime, `HOME` and `CODEX_HOME` for bounded operator-attestation and the
explicitly labeled legacy-v2 Hermes profile metadata boundary, the direct-stdio
caller binding, and an optional explicit Python interpreter path. The current
host-v3 transport is Codex-host only; no Hermes/MiniMax selector or provider
credential is a current kernel input. The launcher supplies the canonical
project and workspace roots itself. Linux temporary paths are normalized to
`/tmp`.
Host cognition markers are replaced with inactive values.

Provider keys, access tokens, private keys, credentials, passwords, Mongo
connection strings, persona values, `NODE_OPTIONS`, external TokenPath roots,
and every other ambient variable are absent from the kernel child. A future
integration that needs another value must add a named non-secret contract and
synthetic containment proof. Prefix-wide or copy-then-scrub forwarding is not permitted.

The legacy `cstar_mongo_mailbox` surface is also retired in source, not merely
disabled by the allowlist. All three compatibility actions return
`legacy_mongo_mailbox_retired_use_cstar_kernel_hall_surfaces` before secret,
driver, network, or mutation activity.

`cstar_warden` is classified `EXECUTION` because its `scan` action starts a
local process. `cstar_warden list` is a static read and starts no process. A scan can
use only the canonical repository-venv interpreter path; an ambient or
arbitrary absolute interpreter is rejected. The
Python child receives only `PYTHONPATH`, deterministic Python controls, and
normalized temporary paths with Execa environment extension disabled. Warden
base classes never construct a search client. Huginn performs local regex checks only.
Provider-backed research belongs behind
`cstar_researcher_request`; Shadow Forge is not a registered warden.

The kernel source watcher is disabled by default. Only an explicit local
development process with `CSTAR_KERNEL_ENABLE_WATCH=1` may attach it; a host
configuration setting `CSTAR_KERNEL_DISABLE_WATCH=1` remains an overriding
deny. Bootstrap diagnostics persist only an allowlisted error code and a
truncated SHA-256 fingerprint. Raw messages, stacks, paths, and environment
values are never written to the bootstrap log, which is no-follow,
single-link, current-user-owned, mode `0600`, and capped at 256 KiB. Existing
log directories must be current-user-owned and not group- or world-writable;
unsafe storage is rejected rather than repaired implicitly.

The old `src/core/mimir_client.js` bridge is an import-safe retirement
tombstone. It returns
`legacy_mimir_js_bridge_retired_use_host_native_researcher` and cannot build a
shell command, start Python, forward environment state, or activate a host
model.

Focused proof lives in:

- `tests/unit/cstar-kernel-mcp/test_kernel_environment_boundary.test.ts`
- `tests/unit/cstar-kernel-mcp/test_runtime_execution_boundary.test.ts`
- `tests/unit/test_runtime_execution_classification_documentation.py`
- `tests/unit/engine/wardens/test_base.py`
- `tests/empire_tests/test_huginn_empire.py`
- `tests/unit/test_retired_mimir_js_bypass.test.ts`
- `tests/features/cstar_kernel_secret_environment_boundary.feature`
- `tests/features/cstar_runtime_execution_classification.feature`
