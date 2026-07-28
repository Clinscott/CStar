Feature: Optional OS keyring type-check boundary

  Scenario: Portable builds do not require the native keyring package
    Given the OS keyring package is an optional runtime integration
    When TypeScript checks CStar without that package installed
    Then the optional dynamic import remains type-checkable
    And runtime loading still fails closed with an actionable error
    And installed keyring declarations are not replaced by a repository-wide shim
