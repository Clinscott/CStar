Feature: Global System Behaviors

  Scenario: Baseline execution
    Given the Corvus Star system is active
    Then it maintains the Pact and coordinates the Ravens

  Scenario: Intelligence Generation (The One Mind)
    Given a system component requires semantic analysis or reasoning
    When the request is processed
    Then it MUST utilize the Host Agent (One Mind) exclusively
    And it MUST NOT use local API keys or direct SDK connections

  Scenario: Composite Execution (The Weave Protocol)
    Given a complex architectural mission is defined
    When the agent implements the logic thread
    Then it MUST be structured as a formal Weave
    And it MUST orchestrate logic via 'dispatchPort.dispatch()'
    And it MUST adhere to the Triad of Verification
