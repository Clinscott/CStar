# Corvus Star Gemini Pointer

CStar is the Corvus estate control plane. Gemini is a host agent, not an
alternate lifecycle authority.

Use the direct `cstar-kernel` MCP surface for bounded health, handoff, Augury,
Hall search, bead lifecycle, Forge/Researcher requests, and result validation.
Start with only the calls the task needs: `cstar_doctor` when health is unknown,
`cstar_handoff` when resuming, `cstar_augury` when route or scope is ambiguous,
and at most one broad `cstar_hall_search` before narrowing.

Do not invoke retired terminal routes such as `hall`, `orchestrate`, `ravens`,
`one-mind`, public AutoBot, direct Hermes, or legacy weaves. Host-native
planning remains in the active Gemini conversation. Implementation uses the
durable CStar Forge request/execute lane; research uses the authorized
Researcher lane.

Persona is style-only. Read it only from the bounded `cstar_status` result; do
not open or request CStar configuration or secret-bearing objects.

Current authority and procedure live in the nearest `AGENTS.md`,
`docs/integrations/cstar-kernel-mcp.md`, and the applicable CStar runbook.
