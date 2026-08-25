# CStar Kernel Code and Control Root Boundary

The supported direct-stdio kernel has two roots with different authority.

- `CODE_ROOT` is derived from `bin/cstar-kernel-mcp.js`. It owns the launcher,
  TypeScript entrypoint, source watcher, hub capability and intent registry,
  dispatch contracts, Warden driver, and Forge adapter/runtime files.
- `CONTROL_ROOT` is supplied by the supported host wrapper. It owns Hall,
  lifecycle state, persona projection, telemetry, bootstrap logs, Forge
  receipts/artifacts, and estate-relative target containment.

The launcher never substitutes one root for the other. A live MCP launch fails
before child spawn when `CSTAR_CONTROL_ROOT` is missing, relative, noncanonical,
symlinked, not owned by the current user, group/world writable, or lacks an
existing safe `.stats/pennyone.db`. It creates no replacement Hall. Hostile
ambient `CSTAR_CODE_ROOT`, `CSTAR_PROJECT_ROOT`, and `CSTAR_WORKSPACE_ROOT`
values are not copied; the launcher supplies the complete child binding.

The child receives `CSTAR_CODE_ROOT=CODE_ROOT`,
`CSTAR_CONTROL_ROOT=CONTROL_ROOT`, and the legacy project/workspace aliases set
to `CONTROL_ROOT`. `PathRegistry` accepts only the control binding in live MCP
mode and refuses `setRoot`. Direct TypeScript server launch without the
supported launcher fails closed. Library imports and synthetic unit tests may
retain their local default without starting a server.

`cstar_status` and `cstar_doctor` expose a non-authoritative
`runtime_lineage` receipt containing both canonical roots, root fingerprints,
launcher/entrypoint/package-lock/TSX hashes, dependency status, and private
Forge runtime manifest hashes. These values prove observed lineage; they grant
no installation, activation, spend, restart, or production authority.

Kernel root health and Forge readiness are separate. Forge readiness requires:

1. a supported live code/control binding;
2. synchronized `package.json` and checked-in lock root metadata, with no stale
   install-script marker, plus a real `CODE_ROOT/node_modules` dependency tree
   matching the checked-in lock, including the installed TSX version (a symlink
   or ancestor fallback is only partial lineage);
3. the manifest-bound private Hermes runtime under the validated code closure.

The clean-source activation worktree initially has no dependency tree. Reusing
canonical CStar `node_modules` is forbidden when its lock differs. An exact-lock
install cannot repair stale checked-in lock metadata. Lock regeneration is a
separately authorized source change; the subsequent exact-lock install is a
separately authorized installation action. Both receipts must be validated
before `readiness.forge` can be true.

Absolute authorized spoke/worktree targets remain exact request targets. They
do not become alternate Hall roots. Warden targets, bounties, and working state
remain control-root scoped while its driver and `PYTHONPATH` come from code.
Augury planning/session state remains in Hall while intent grammar comes from
the code-root registry.
