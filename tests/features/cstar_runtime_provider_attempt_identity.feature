Feature: Runtime provider attempts keep exact identity and timeout ownership
  CStar must not select a provider surface from ambient availability or invent
  execution evidence after a failed or incomplete delegated attempt.

  Scenario: A typed provider request names one exact surface
    Given a host provider and several execution dependencies are available
    When the request names one supported execution surface
    Then only that provider and surface may be dispatched
    And failure does not fall through to a second surface

  Scenario: A delegated result omits required attempt evidence
    Given a delegated result omits any of the five attempt identity fields
    When the runtime validates the result
    Then the result fails closed
    And missing provider, surface, or dispatch evidence is not invented
    And execution dispatch is recorded as unreported

  Scenario: Structured failure evidence conflicts with legacy text
    Given a delegated failure carries complete structured attempt evidence
    And its legacy message text reports a contradictory identity
    When the runtime records the failed branch
    Then the structured evidence is authoritative
    And no second provider or surface is attempted

  Scenario: A dispatched provider runner reaches its timeout
    Given exactly one delegated process has been dispatched
    When its bounded timeout expires
    Then the exact process receives an abort signal
    And CStar waits for the process runner to settle
    And the timeout records execution as dispatched
    And no retry or alternate surface runs
