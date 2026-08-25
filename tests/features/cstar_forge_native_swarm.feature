Feature: Native Forge request authority and one-run lease

  Background:
    Given the explicitly selected connection is forge-native-codex-swarm-v1
    And the requested selector is gpt-5.6-luna with max reasoning
    And actual host identity is unreported without distinct host attestation

  Scenario: Durable authority is intersected before reservation
    When CStar binds the durable SET, immutable request, connection policy, and run lease
    Then a broader scope, caller evidence root, or caller identity is rejected
    And an inactive generation cannot be activated by a status or reservation read

  Scenario: One native run has separate package and control lease
    When the Orchestrator reserves the explicitly bound request
    Then identical replay returns the same run lease and package
    And the worker package does not contain cancellation authority
    And a conflicting replay and duplicate live run are rejected

  Scenario: Copied state migration and UNKNOWN are fail closed
    When an additive migration is rehearsed on a copied database
    Then existing rows and foreign-key checks remain unchanged
    And an UNKNOWN run cannot be resumed, replaced, or replayed with a new scope

  Scenario: Legacy generations remain readable but not executable
    When a v2 or v3 connection is read from its tombstone history
    Then execution is rejected before reservation
