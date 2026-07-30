Feature: Forge repairs proven pre-provider failures without losing operator intent
  Scenario: A mechanical failure preserves the exact build request
    Given one immutable authorized Forge request has one provider attempt and zero retries
    And a mechanical cycle proves zero provider requests, zero ambiguous dispatch, zero spend, no live source, and no workspace commit
    When CStar records the allowlisted local failure
    Then the attempt is FAILED_RETRYABLE with budget class mechanical_no_provider
    And the request remains AUTHORIZED with its original hash and authorization
    And a cstar.forge_pre_provider_continuation.v1 receipt is PENDING_REPAIR
    And the operator is not asked to issue the build request again

  Scenario: The repaired build resumes only after independent validation
    Given the pending continuation binds the same thread, request, targets, outputs, actions, locks, and spend boundary
    And CStar produces the bounded owner-only continuation-runtime-evidence.json for the repaired runtime
    And cstar_record_result independently validates the repaired runtime artifacts and target preimages
    When CoS resumes the unchanged request with a new internal idempotency key and retry_of_attempt_id
    Then the continuation becomes RESUMED
    And the mechanical cycle consumes no provider attempt or retry budget
    And only the original authorization supplies execution authority

  Scenario: Provider or authority uncertainty never inherits continuation
    Given provider start, ambiguous dispatch, unknown spend, live source, missing proof, scope drift, worktree drift, lock drift, expiry, revocation, or another request is observed
    When continuation eligibility is evaluated
    Then no pre-provider continuation is created
    And an appended same-turn revocation is treated as later operator input
    And the provider_or_unknown or terminal policy remains in force

  Scenario: Repeated mechanical failures stop boundedly
    Given the same immutable request is being repaired through mechanical cycles
    When the third consecutive identical failure or tenth total mechanical cycle is recorded
    Then the continuation is BLOCKED
    And CStar does not invoke the provider again
    And the original request is not widened or silently reauthorized

  Scenario: A legacy terminal trace is reconciled safely
    Given a FAILED_FINAL attempt durably binds the exact terminal trace SHA-256
    And that trace proves an allowlisted zero-provider failure
    When the same-thread unrevoked caller resumes the exact request
    Then CStar may reconcile it once to FAILED_RETRYABLE
    But a changed trace, different thread, expired grant, or later revocation cannot mutate Hall
