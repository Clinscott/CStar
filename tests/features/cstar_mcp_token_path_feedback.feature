Feature: CStar MCP token-path feedback loop

  Scenario: Result recording closes token-path advice loops
    Given cstar_augury returns token-path advice for a bead or target path
    When cstar_record_result records the result for that bead
    Then cstar_record_result auto-links the recent advice
    And a token-path observation is written for dashboard feedback

  Scenario: Missing token-path observations are explicit
    Given cstar_record_result cannot find matching token-path advice
    When it records the validation result
    Then the validation result still persists
    And the response reports token_path_observation_status as not_recorded
    And the response includes a plain warning reason
