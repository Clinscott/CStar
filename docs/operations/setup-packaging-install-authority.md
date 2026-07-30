# Setup, Packaging, and Installation Authority

Distribution construction is a source-local development operation. Installation,
host configuration, activation, restart, deployment, and production claims are
separate operator gates and cannot be inferred from a generated bundle.

The supported Codex operation is verified source staging, not installation. The
compatibility-named `installCodexPlugin` helper and `npm run
install:codex-local` may run only in an explicitly authorized staging window.
They require an already prepared personal marketplace containing exactly one
approved local `corvus-star` entry, validate generated `lineage.json`, and
atomically stage byte-identical source under `~/plugins/corvus-star`.

Source staging never creates or rewrites the marketplace, invokes `codex plugin
add`, refreshes Codex cache state, activates a plugin, restarts a process, or
proves live runtime. A missing, invalid, or ambiguous marketplace entry fails
before the personal plugin source root is created. Installation and activation
remain separate operator-gated host actions.

Direct host mutation paths remain retired:

- Codex marketplace creation or mutation, direct `codex plugin add`, and cache
  manipulation have no repository fallback.
- Gemini extension symlink creation:
  `direct_gemini_extension_install_retired_requires_supported_host_surface`
- local venv, dependency installation, or global npm link:
  `direct_local_setup_retired_requires_operator_gated_supported_installer`
- ambient Codex activity files and timers:
  `legacy_codex_cli_activity_sidecar_retired_use_host_runtime_receipt`
- automatic Codex self-heal:
  `legacy_codex_self_heal_retired_requires_operator_gated_supported_plugin_surface`
- direct launcher smoke:
  `legacy_codex_launcher_smoke_retired_use_cstar_doctor_and_live_runtime_proof`

These retired compatibility entrypoints fail before reading host config,
marketplace state, environment contents, credentials, or package state. They
do not create directories, links, caches, virtual environments, logs, timers,
child processes, or global package links.

The complete flow is: validate source and distribution lineage; represent the
repair and operator decision in CStar; stage Codex source only when staging is
authorized; use the host's supported plugin or extension surface during a
separately bounded activation window; restart only when separately authorized;
then prove live lineage, tools, request identity, and process cleanup. Source
proof alone is never live-runtime or production proof.
