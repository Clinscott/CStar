Feature: TokenPath observations are absent from generic result recording
  Scenario: A validation result does not become a TokenPath observation
    Given a CStar bead has no independently measured TokenPath payload
    When its result is recorded
    Then CStar persists only the validation result permitted by its evidence authority
    And CStar does not infer, auto-link, or promote a TokenPath observation

  Scenario: The generic result tool exposes no TokenPath input contract
    Given TokenPath promotion is quarantined behind a separate sidecar lifecycle
    When a caller inspects cstar_record_result
    Then no episode id or TokenPath observation argument is advertised
    And validation persistence remains independent of TokenPath
    And no TokenPath response or promotion record is written
