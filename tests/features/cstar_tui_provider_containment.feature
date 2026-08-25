Feature: CStar TUI provider containment
  The operator TUI must remain read-only unless the operator explicitly requests work.

  Scenario: Opening and inspecting the TUI is passive
    Given a host provider is available
    When the operator opens the TUI or requests status
    Then no provider, model, subprocess, or runtime dispatch is started
    And no host governor resume is inferred from provider presence

  Scenario: Blackboard compaction is explicit and single-flight
    Given the blackboard has enough entries to compact
    When the operator types "compact blackboard"
    Then one typed operator compaction request may call the host provider
    And concurrent explicit requests share one in-flight operation

  Scenario: Failed compaction does not retry in the background
    Given an explicit blackboard compaction request fails
    Then the failure is reported without saving partial state
    And no timer retries or overlaps the failed provider request
