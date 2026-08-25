Feature: CStar MCP TokenPath quarantine boundary

  Scenario: Augury reports quarantine without consulting an external advisor
    Given TokenPath has no independently validated promotion
    And AUGURY_TOKEN_PATH_ROOT names a hostile synthetic external root
    When cstar_augury resolves a mission
    Then it returns deterministic quarantined non-actionable TokenPath status
    And it does not probe or import the external TokenPath root
    And it attaches no policy, episode, confidence, budget, or live advice
    And it writes no advice or observation record

  Scenario: Compatibility append entrypoints fail closed
    Given TokenPath quarantine is active
    When a caller invokes an advice or observation append entrypoint
    Then the entrypoint returns no receipt
    And it writes no project or temporary fallback file
    And historical project-local telemetry remains read-only
