Feature: Hall database handle-cache boundary
  Scenario: Distinct Hall roots cannot accumulate without bound
    Given a long-lived Hall database facade
    When eight distinct canonical roots are already cached in one access mode
    Then a ninth distinct root fails before a stats directory or SQLite file is created
    And explicit close resets the bounded cache
