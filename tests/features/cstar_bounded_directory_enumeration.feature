Feature: Bounded CStar directory enumeration
  Scenario: Long-lived discovery reads cannot materialize unbounded directories
    Given a Codex sessions proposal or verified mounted-spoke skill directory
    When CStar enumerates its entries
    Then entries are consumed incrementally under a fixed cap
    And a cap breach fails closed without a partial authoritative inventory
