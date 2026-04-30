Feature: Mimir Synaptic Link
  Scenario: Resolving User Intent via direct sampling
    Given the One Mind is active
    When a user query is dispatched to the Mimir client
    Then the client MUST perform a direct synaptic strike to the Host Agent
    And the result MUST be returned as raw programmatic intelligence
    And the Hall of Records MUST be updated with the resulting trace.

  Scenario: High-Speed Synapse DB Communication
    Given the Synapse Database is operational
    When a query is inserted into the synapse table
    Then the Mimir client MUST poll for a COMPLETED status
    And the response MUST be retrieved within the 30-second timeout.
