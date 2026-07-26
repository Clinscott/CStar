Feature: Retire the legacy Corvus Star Trace routing gate
  CStar must have one host-facing routing authority while preserving genuine
  observability traces and a bounded legacy-input migration seam.

  Scenario: A host begins a new mission
    Given the CStar kernel MCP is available
    When the host requests cstar_augury for the current prompt and targets
    Then the MCP result is the authoritative mission route
    And the result includes the selected Council expert, lens, guardrails, and selection reason
    And the sidecar transports that result without selecting another route or expert

  Scenario: The same planning key continues
    Given full Augury context was delivered for a planning key
    When the host invokes the sidecar again with the same planning key
    Then the sidecar delivers lite Augury context
    And a new planning key still receives full Augury context

  Scenario: MCP Augury is unavailable or blocked
    When the sidecar cannot obtain a routed cstar_augury result
    Then it reports unavailable or blocked routing
    And it does not fabricate an ORCHESTRATE route
    And it does not fabricate a default Council expert

  Scenario: An old prompt contains the former selection header
    When the compatibility parser reads the legacy header
    Then it marks the input as deprecated legacy compatibility
    And no active instruction, hook, HUD, or generated response emits that header

  Scenario: Runtime tracing remains available
    Given CStar records a session trace, telemetry trace, execution trace, or trace_id
    Then the observability record remains intact
    And it is not treated as mission-routing authority
