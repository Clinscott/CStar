Feature: Evolve Skill
  Scenario: Proposal boundary is explicit
    Given an open sovereign bead exists in the Hall of Records
    When evolve executes the bead-driven optimization loop
    Then it must write a validation record and a Hall-backed contract proposal
    And it must not silently mutate the canonical contract surface

  Scenario: Promotion is validation-gated
    Given a Hall-backed evolve proposal exists
    When the linked validation verdict is not accepted
    Then promotion must be blocked
    And the canonical skill contract must remain unchanged
