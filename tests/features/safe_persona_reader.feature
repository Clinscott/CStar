Feature: Bounded active-persona context
  CStar exposes persona as style-only projected state without opening a
  secret-bearing configuration object.

  Scenario: Read the active persona from CStar
    Given Hall has a projected active persona scalar
    When the caller invokes cstar_status
    Then the response contains only the bounded persona projection
    And no raw configuration object is read or returned

  Scenario: CStar status is unavailable
    Given cstar_status cannot return current state
    When persona context would otherwise be used
    Then the caller omits persona context and records a freshness gap
    And there is no local file fallback

  Scenario: Legacy style callers import the compatibility registry
    Given a caller has not received projected CStar status
    When it imports the compatibility persona registry
    Then it receives no active persona default
    And no local file fallback or configuration read occurs
