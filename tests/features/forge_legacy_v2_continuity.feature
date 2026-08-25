Feature: Preserve an unspent Forge v2 request through a narrowed compatibility grant
  The original durable request must remain immutable while a fresh operator
  challenge binds current typed authority and runtime evidence.

  Scenario: Reconcile an exact unspent v2 request
    Given a canonical cstar.forge_request.v2 receipt is pending with zero attempts
    And its target, required output, package lock, adapter, and request hashes agree
    When the same work is requested through the current typed Forge contract
    Then CStar returns the original request id and request hash
    And CStar binds the verified reconciliation turn once as requester lineage
    And it returns a cstar.forge_legacy_v2_execution_grant.v1 manifest
    And the challenge begins CSTAR_FORGE_AUTHORIZE v2-compat-v1
    And the compatibility manifest binds project_files and synthetic_only
    And it permits one attempt, zero retries, and no live source
    And the original canonical request JSON is not rewritten or reissued

  Scenario: Close delivery through an independent validator
    Given a reconciled v2 request has bound requester lineage
    And a distinct authorizing executor delivered every required output once
    When a third root thread validates the required output and response artifacts
    Then cstar_record_result records verified evidence
    And the attempt and request become succeeded
    And requester, executor, and validator identities remain distinct

  Scenario: Fail closed on compatibility drift
    Given an unspent Forge v2 request has a fresh compatibility manifest
    When its semantics, package lock, runtime, output scope, or manifest digest drifts
    Then authorization fails before writable Hall access
    And execution fails before attempt reservation or provider invocation
    And no replacement request is created

  Scenario: Replay the one durable attempt without another invocation
    Given the exact compatibility challenge authorized one v2 request
    And its first idempotency key produced a delivered-unverified attempt
    When the same idempotency key is submitted again
    Then CStar returns the durable attempt receipt
    And it does not reserve or invoke a second attempt
