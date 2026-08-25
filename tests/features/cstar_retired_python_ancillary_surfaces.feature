Feature: Retired Python ancillary execution surfaces fail closed
  The CStar kernel must remain the canonical control-plane boundary.

  Scenario: A legacy provider or source-collection helper is invoked
    Given the helper is an import-compatible retired Python surface
    When an action method is called with a synthetic fixture
    Then it returns a stable no-effect result or retirement error
    And it makes no provider, network, subprocess, Git, or source write

  Scenario: A legacy state synchronization helper is invoked
    Given Synapse and Python HTTP telemetry are retired
    When a caller attempts to synchronize or record state
    Then no Hall, SQLite, filesystem, or telemetry side channel is used
    And the caller is directed to CStar kernel lifecycle surfaces

  Scenario: A pure compatibility classifier is invoked
    Given no action is required
    When a caller uses a retained parser or classifier
    Then the result is deterministic
    And no environment, credential, provider, or source is inspected
