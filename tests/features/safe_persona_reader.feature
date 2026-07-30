Feature: Bounded active-persona context
  CStar exposes persona and non-authoritative development posture without
  exposing a secret-bearing configuration object.

  Scenario: Read the active persona from CStar
    Given the isolated reader can resolve the configured active persona
    When the caller invokes cstar_status
    Then the response contains only the bounded persona projection
    And no raw configuration object or neighboring secret is returned

  Scenario: CStar status is unavailable
    Given cstar_status cannot return current state
    When persona context would otherwise be used
    Then the caller omits persona context and records a freshness gap
    And no caller opens the local configuration as a fallback

  Scenario: Odin guides iterative development
    Given cstar_status returns O.D.I.N.
    When Augury supplies development guidance
    Then the posture is build_run_repair
    And recoverable local failures do not become operator gates

  Scenario: Alfred guides security hardening
    Given cstar_status returns A.L.F.R.E.D.
    When Augury supplies development guidance
    Then the posture is secure_harden
    And trust boundaries, abuse cases, failure containment, and validation are emphasized

  Scenario: Legacy style callers import the compatibility registry
    Given a caller has not received projected CStar status
    When it imports the compatibility persona registry
    Then it receives no active persona default
    And no local file fallback or configuration read occurs
