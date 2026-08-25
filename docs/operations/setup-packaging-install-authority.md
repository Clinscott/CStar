# Setup, Packaging, and Installation Authority

Distribution construction is a source-local development operation. Installation,
host configuration, activation, restart, deployment, and production claims are
separate operator gates and cannot be inferred from a generated bundle.

Direct host mutation paths are retired:

- Codex plugin copy or marketplace mutation:
  `direct_codex_plugin_install_retired_use_supported_codex_plugin_surface`
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

These compatibility entrypoints fail before reading host config, marketplace
state, environment contents, credentials, or package state. They do not create
directories, links, caches, virtual environments, logs, timers, child
processes, or global package links.

The supported flow is: validate source and distribution lineage; represent the
repair and operator decision in CStar; use the host's supported plugin or
extension surface during a bounded activation window; restart only when
separately authorized; then prove live lineage, tools, request identity, and
process cleanup. Source proof alone is never live-runtime or production proof.
