# Claude Code pointer for CStar

This file is intentionally short. It grants no authority and does not duplicate
the CStar tool inventory, runtime topology, or operating procedures.

Before CStar work, read the applicable `AGENTS.md` files from the Corvus root to
this repository. Then use these canonical references for the task at hand:

- `docs/operations/cos-context-refresh-new-thread-packet.md` for CoS handoff;
- `docs/operations/corvus-forge-pipeline-playbook.md` and
  `docs/operations/corvus-forge-skill-spec.md` for Forge work;
- `docs/integrations/cstar-kernel-mcp.md` for the kernel contract;
- `package.json` for supported validation commands.

Operational invariants:

- Use `cstar-kernel` MCP for lifecycle and state work when it is available.
- Route implementation through the durable CStar Forge lifecycle. Do not use
  direct Hermes, retired AutoBot, One Mind, Ravens, or generic shell execution
  as a substitute.
- Treat PMTs as project-context repositories only and MM as legacy.
- Preserve explicit gates for spend, live sources, installation, restart,
  deployment, Git mutation, secret/config mutation, and production claims.
- Never read the complete `.agents/config.json`; persona context comes only
  from the bounded `cstar_status` projection.
- Verify current source and observed runtime separately. A registry, document,
  historical log, or model claim cannot prove live activation.

If this pointer conflicts with `AGENTS.md` or a canonical runbook, follow the
document with higher authority and repair this pointer.
