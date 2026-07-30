Feature: Canonical skill registry shape

  Scenario: Read a capability-id keyed registry
    Given skill registry entries are an object keyed by safe capability ids
    When a registry consumer resolves capabilities
    Then it receives the same identity-consistent entries

  Scenario: Reject malformed canonical entries
    Given canonical entries are an array, contain unsafe ids, duplicate ids, or unsafe paths
    When the registry is parsed or audited
    Then it fails closed without activating legacy fallback entries

  Scenario: Discover compatibility without widening defaults
    Given calculus is a compatibility entry
    When operator and distribution catalogs are built
    Then calculus is discoverable in the registry
    And it is absent from default executable catalogs
