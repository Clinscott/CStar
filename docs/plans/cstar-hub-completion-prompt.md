# Historical CStar Hub completion prompt

> **Superseded and non-executable.** This file previously contained a May 2026
> cold-start prompt for direct Hermes/MiniMax-M2.7 work, live collectors, vault
> writes, and cron mutation. Those instructions are not current authority and
> must not be replayed.

The old prompt was removed because it contradicted the current CStar control
plane: Researcher owns authorized evidence collection, Corvus Forge owns
implementation through `cstar_forge_request -> cstar_forge_execute`, and live
source, installation, scheduling, secret/config, and deployment actions remain
separately operator-gated.

For current work, start with:

- `/home/morderith/Corvus/AGENTS.md` and the nearest repository `AGENTS.md`;
- `docs/operations/cos-context-refresh-new-thread-packet.md`;
- `docs/operations/corvus-forge-pipeline-playbook.md`;
- `docs/operations/corvus-forge-skill-spec.md`;
- `docs/integrations/cstar-kernel-mcp.md`.

Historical claims in related May 2026 plans are evidence leads only. Reverify
them through current CStar lifecycle and runtime surfaces before relying on
them.
