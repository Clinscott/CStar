Feature: Sovereign Engine (sv_engine)
  Scenario: Initializing the One Mind compute plane
    Given a valid project root path
    When the SovereignEngine is instantiated
    Then the system MUST bootstrap the environment (encoding, paths, logs)
    And the SovereignHUD MUST display the initiation ceremony
    And the engine MUST be ready to receive natural language queries.

  Scenario: Execution of Intelligence Scans
    Given an active engine session
    When a query is scoured for intelligence
    Then the system MUST return a structured JSON response
    And the results MUST be logged to the session traces.
