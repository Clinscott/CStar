Feature: Generated artifact tracking boundary

  Scenario: Machine-local analysis state stays outside source control
    Given CStar regenerates ESLint reports and nested .stats projections locally
    When the repository tracking boundary is inspected
    Then no generated ESLint report is tracked
    And no nested .stats artifact is tracked
    And regenerated artifacts remain ignored
