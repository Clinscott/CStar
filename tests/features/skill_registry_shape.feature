Feature: Skill registry shape remains authoritative
  The registry must preserve capability identity and fail closed on malformed input.

  Scenario: Runtime and audit consumers read a keyed capability map
    Given skill registry entries are an object keyed by capability id
    When a runtime consumer resolves a registered capability
    Then it uses the capability id rather than an array index
    And an array-shaped registry cannot be dispatched or packaged
    And the registry audit refuses malformed input without discarding entries
