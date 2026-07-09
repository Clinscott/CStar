Feature: CStar MCP handoff target awareness

  Scenario: Target-aware handoff demotes stale active sessions
    Given CStar has an active handoff for one set of target paths
    When an MCP caller asks for handoff state with different current target paths
    Then cstar_handoff reports the active handoff as background context
    And the stale lead bead is not exposed as the authoritative current mission

  Scenario: Public MCP tools have smoke coverage
    Given the source-backed CStar MCP stdio launcher boots
    When the integration harness lists and calls public non-legacy MCP tools
    Then every tool either returns a bounded success envelope or fails closed
    And no duplicate tool names are exposed in tools/list
