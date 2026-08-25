Feature: Validation evidence fails closed
  Detached validation helpers must not turn an absence of failures into proof,
  and CStar must derive verified authority from exact execution lineage.

  Scenario: Passing check without independent evidence
    Given a detached validation result has one passing check
    And it has no independent evidence digest or validator identity
    When the validation verdict is constructed
    Then the verdict is INCONCLUSIVE
    And it is not ACCEPTED

  Scenario: Accepted SPRT with a zero denominator
    Given a detached validation result reports an accepted SPRT verdict
    And the SPRT total is zero
    When the validation verdict is constructed
    Then the verdict is INCONCLUSIVE
    And the zero sample denominator is recorded as an evidence gap

  Scenario: A caller claims validator identity or independence
    Given a cstar_record_result request contains caller-supplied identity or independence fields
    When the strict tool schema validates the request
    Then the request is rejected
    And no verified validation receipt is persisted

  Scenario: The validator shares the requester or executor root thread
    Given hash-verified evidence for an exact Forge execution receipt
    When CStar derives the current validator request identity
    And its root thread matches the Forge requester or authorizing executor
    Then validation fails closed as not independent
    And the Forge attempt remains unfinalized

  Scenario: Evidence is replayed across Forge executions
    Given a verified-v2 manifest bound to execution receipt A
    When it is offered to finalize execution receipt B
    Then CStar rejects the subject and lineage mismatch
    And neither execution changes state
