# Retired Orphan Packaging and Dogfood Scripts

Four unreferenced compatibility scripts are terminal before action-bearing
effects:

| Script | Stable failure |
| --- | --- |
| `scripts/dogfood-usb-sentry-bead.mjs` | `legacy_usb_sentry_dogfood_script_retired_use_cstar_spoke_bead_import` |
| `scripts/package_skills_python.cjs` | `legacy_python_skill_packager_retired_use_supported_skill_packaging_surface` |
| `scripts/package_skills_node.cjs` | `legacy_node_skill_packager_retired_use_supported_skill_packaging_surface` |
| `scripts/sync-plugin-version.mjs` | `legacy_claude_plugin_version_sync_retired_use_distribution_builder` |

The dogfood script may not bypass MCP transport to write live bead state. Skill
packages require a supported, explicitly authorized packaging surface. Host
distribution versions come from the registry-backed distribution builder; the
retired Claude plugin mirror is not an install or release authority.

These scripts start no child, read or write no source or state, touch no Hall
or SQLite database, and perform no Git, installation, provider, network, or
configuration operation.

The unused TypeScript cascading-context loader is separately terminal with
`legacy_cascading_context_loader_retired_use_host_instruction_surface`. Host
instructions come from the supported host instruction stack; CStar does not
walk parent or home directories and concatenate ambient files.
