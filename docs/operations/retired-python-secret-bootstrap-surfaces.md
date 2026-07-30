# Retired Python Secret and Bootstrap Surfaces

The legacy Python bootstrap, direct Brave client, response harvester,
KnowledgeHunter, repository-local vault, and direct provider model probes are
tombstones. They do not read dotenv files, ambient credentials, quota ledgers,
configuration objects, or live sources. They do not invoke providers or write
fixtures, reports, keys, vault artifacts, Hall state, or project state.

| Compatibility family | Stable error | Supported route |
| --- | --- | --- |
| Python bootstrap | `legacy_python_bootstrap_retired_use_cstar_kernel` | bounded CStar kernel status and runtime surfaces |
| Direct source and response tools | `legacy_python_source_tools_retired_use_authorized_researcher` | authorized CStar Researcher request lifecycle |
| Vault and direct provider probes | `legacy_secret_vault_provider_tools_retired_use_supported_surfaces` | supported host secret and provider surfaces under an operator gate |

Import, help, and readiness inspection remain passive. Calling an action-bearing
compatibility API fails before environment, filesystem, provider, network,
process, Hall, StateRegistry, or callback access. These tombstones do not grant
Researcher, provider, secret, installation, restart, activation, or deployment
authority.

`Redactor` is the only retained behavior. It is a pure in-memory transform over
an explicit mapping supplied by its caller. An empty mapping redacts nothing;
there is no vault, environment, config, or filesystem discovery fallback.
