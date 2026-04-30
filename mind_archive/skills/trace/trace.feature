Feature: Corvus Star Augury Selection Block

  Scenario: The Corvus Star Augury block is not confused with session traces
    Given a user request needs intent classification
    When the trace skill is triggered
    Then it emits the Corvus Star Augury [Ω] selection block
    And it does not run session trace visualization or replay tooling
