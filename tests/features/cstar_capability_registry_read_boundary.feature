Feature: Capability registry reads are bounded and non-authoritative
  Registry metadata may describe a surface but cannot grant execution.

  Scenario: A runtime reads the checked-in capability registry
    Given the supplied project root is canonical
    And .agents/skill_registry.json is a bounded unique regular file
    When routing metadata is loaded
    Then only that file is parsed
    And no ambient control root Hall secret provider process network or write effect occurs

  Scenario: A registry path is unsafe or malformed
    Given the root or registry uses traversal symlinks hardlinks oversize content or invalid JSON
    When routing metadata is loaded
    Then the read fails closed
    And no fallback grammar is mistaken for validated registry state
