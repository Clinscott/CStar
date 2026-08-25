Feature: CStar validation evidence root binding
  Validation evidence follows the exact Hall repository binding while Hall state
  remains owned by the control root.

  Scenario: Hub and spoke evidence roots remain distinct and deterministic
    Given a hub repository row is bound to the control root
    And the active source is a nested code worktree
    When CStar resolves the validation evidence root
    Then the hub evidence root is the code root
    And a spoke evidence root is its registered repository root
    And a missing or mismatched repository binding fails closed
    And no current working directory or filesystem existence check changes the result
