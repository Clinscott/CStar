Feature: Autonomous dispatch from an exact SET manifest
  A persisted SET grant may authorize only its unchanged immutable request and
  only from a later structural turn in the same canonical root thread.

  Scenario: Authorize a pending Batch 1 request from a no-record turn
    Given the original root turn contains one exact SET and the request is PENDING_AUTH
    And the later same-root structural turn appends no canonical user record
    When Forge authorizes the pending request
    Then the original SET operator identity is preserved
    And the host message says the original SET grant authorized the immutable request

  Scenario: Execute and replay from a later same-root structural turn
    Given the exact SET request is already authorized
    When CStar executes or replays it from a later same-root structural turn
    Then execution authority uses autonomous_set_manifest_v1
    And replay does not create a second attempt

  Scenario: Reject lineage, revocation, and authority drift
    Given the exact SET request is pending or authorized
    When the caller is cross-thread, forked, or a subagent
    Or the original SET is later revoked
    Or the request or parent-child manifest projection drifts
    Then authorization or execution fails closed without a new attempt

  Scenario: Preserve full identity for legacy non-SET authorization
    Given a legacy exact or ordinary non-SET Forge request
    When a later structural turn has no canonical user record
    Then full current root-user identity is still required
