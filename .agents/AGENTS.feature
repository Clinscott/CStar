Feature: Legacy CStar route remains inactive

  Scenario: Normal estate work does not select a CStar route
    Given the parent Corvus Organism projection governs the estate
    When an agent enters the CStar repository
    Then CStar routes are not selected
    And CStar state is treated as historical evidence only
    And no Bead, SET, mission, effect, receipt, Hall transition, or worker route is created

  Scenario: Legacy source remains inspectable without activation
    Given the operator places legacy CStar source in scope
    When the source is inspected, tested, documented, or migrated
    Then no CStar runtime or host integration is launched
    And protected host configuration remains unread
    And unrelated dirty work is preserved

  Scenario: A narrow legacy diagnostic cannot restore authority
    Given the operator explicitly authorizes one bounded legacy diagnostic
    When that diagnostic runs
    Then its output is evidence only
    And CStar remains inactive after the diagnostic
    And the Corvus Organism remains the workflow authority
