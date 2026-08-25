Feature: Independent evidence can be linked to terminal Forge attempts
  CStar must preserve the execution result while retaining independently
  verified evidence about a failed or indeterminate attempt.

  Scenario Outline: Verified non-positive evidence links without reopening execution
    Given a Forge attempt is terminal with status "<status>"
    And its request, spend, retry, result, and completion fields are recorded
    When a validator root thread distinct from the Forge requester and executor records "<verdict>" with hash-verified evidence
    Then CStar links the validation id and evidence digest to the attempt
    And the attempt and request execution fields remain byte-for-byte unchanged
    And the response reports terminal_evidence_link

    Examples:
      | status       | verdict      |
      | FAILED_FINAL | REJECTED     |
      | UNKNOWN      | INCONCLUSIVE |

  Scenario: Positive evidence cannot resurrect a failed execution
    Given a Forge attempt is terminal with status "FAILED_FINAL"
    When an independent validator records "ACCEPTED" for that execution receipt
    Then CStar rejects the linkage with forge_terminal_failure_validation_cannot_accept_delivery
    And the failed attempt remains unvalidated and terminal

  Scenario: A terminal evidence link is idempotent only for the same evidence
    Given a terminal Forge attempt already has an independent validation link
    When the identical validation is recorded again
    Then CStar returns the existing terminal evidence link
    When a different validation id is recorded for the same attempt
    Then CStar rejects it with forge_execution_already_validated

  Scenario: Legacy or cross-execution evidence cannot be linked
    Given a terminal Forge attempt has an execution receipt
    When validation-v1 evidence or validation-v2 evidence bound to another execution is offered
    Then CStar rejects the linkage without changing execution state
