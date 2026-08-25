Feature: Codex session locator storage boundary
  Scenario: Active-turn lookup is incremental and bounded
    Given a host-owned Codex sessions tree
    When CStar locates the exact root-user thread file
    Then at most 20000 entries and 16 directory levels are inspected incrementally
    And duplicate unsafe or escaping session files fail closed
    And no whole directory is materialized in memory
