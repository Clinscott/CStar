Feature: Native Forge swarm replacement

  Background:
    Given the active connection is forge-native-codex-swarm-v1
    And the requested selector is gpt-5.6-luna with max reasoning
    And actual host identity is unreported without distinct attestation

  Scenario: Authority intersection and one idempotent lease
    When CStar intersects the durable SET, immutable request, policy, and lease
    Then a broader or empty scope is rejected
    And a duplicate idempotency key replays the same run lease
    And worker and control receipts remain separate

  Scenario: Bounded native topology
    Given a native parent plan with zero to three useful disjoint leaves
    When a leaf requests a descendant or overlapping path
    Then the plan is rejected before work begins

  Scenario: Delivery remains unverified
    Given one successful parent and every planned successful leaf receipt
    When the candidate digest and deterministic checks match
    Then the aggregate status is DELIVERED_UNVERIFIED
    And no lifecycle acceptance is recorded by Forge

  Scenario: Legacy connections are recoverably retired
    When a v2 or v3 connection is requested
    Then the generation tombstone rejects execution
    And its exact bytes remain readable under the quarantine manifest
