Feature: CoS and project information-repository architecture
  Scenario: CoS owns routing while PMTs remain passive repositories
    Given CoS has a Corvus estate goal
    When CoS routes execution through CStar, Forge, or Researcher
    Then the PMT receives only a bounded state-update packet
    And the PMT grants no execution, review, approval, or routing authority
    And MM has no active estate-routing role

  Scenario: Delivery and state updates remain distinct
    Given Forge or Researcher returns a bounded delivery
    When CoS records independent evidence in CStar
    Then CoS updates the project information repository
    And the PMT packet does not replace CStar lifecycle state
    But red gates still require explicit operator authorization
