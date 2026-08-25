Feature: Native Forge foundation contracts and copied-state history

  Background:
    Given the explicitly selected connection is forge-native-codex-swarm-v1
    And the requested selector is gpt-5.6-luna with max reasoning
    And actual host identity is unreported without distinct host attestation

  Scenario: Foundation contracts are closed and identity is separated
    When CStar validates a native request or authorization contract
    Then unknown caller-shaped fields are rejected
    And the requested selector is distinct from host-attested actual identity

  Scenario: Copied-state schema is additive and replayable
    When an additive migration is rehearsed on a copied database
    Then legacy rows and scoped foreign-key checks remain unchanged
    And repeating the migration produces the same schema digest

  Scenario: Inactive native generations remain inactive
    When a native generation row is explicitly inactive
    Then a status or executable read rejects it without activating the row

  Scenario: Legacy generations remain readable but not executable
    When a v2 or v3 connection is read from its tombstone history
    Then the historical row is readable
    And execution is rejected before any native reservation path
