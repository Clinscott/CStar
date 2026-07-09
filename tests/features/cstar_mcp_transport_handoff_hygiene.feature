Feature: CStar MCP transport and handoff hygiene

  Scenario: TCP bridge flushes a piped request before exiting
    Given Codex launches cstar-kernel through the configured stdio bridge
    When stdin closes after a JSON-RPC request has been sent to the TCP daemon
    Then the bridge waits for the pending response before shutdown

  Scenario: MCP handoff board follows the current runtime execution bead
    Given a runtime execution bead has a valid Augury contract
    When cstar_handoff is requested
    Then the active board reports that runtime bead instead of stale planning-only state

  Scenario: Stale dist MCP process is retired without killing active daemon state
    Given an old dist/cstar-kernel-mcp.bundle.js process is outside the active Codex config path
    When the hygiene pass retires stale MCP processes
    Then only the stale dist child is terminated and the TCP daemon remains available
