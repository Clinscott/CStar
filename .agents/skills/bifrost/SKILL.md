---
name: bifrost
description: "Use when managing the Model Context Protocol (MCP) bridge, enabling high-fidelity intelligence tools for external host agents."
risk: safe
source: internal
---

# 🔱 BIFROST BRIDGE SKILL (v1.0)

## When to Use
- Use when starting the PennyOne MCP server.
- Use when inspecting the available MCP tools (think, consult_oracle, index_sector).

## MANDATE
Expose the Well of Mimir and Repository Intelligence to the One Mind via the Stdio transport bridge.

## LOGIC PROTOCOL
1. **BOOTSTRAP**: Initialize the PennyOne MCP server with local environment configuration.
2. **TOOL REGISTRATION**: Bind AST analysis, intent search, and scan triggers to the MCP interface.
3. **TRANSPORT LOCK**: Establish a secure StdioServerTransport connection.
4. **SAMPLING PROXY**: Route intelligence requests through the host session without requiring API keys.

## USAGE
`cstar bifrost start`
