Feature: CStar S01 deterministic lifecycle runner hooks
  The runner is a closed, hash-bound reducer. It records transport intent and
  evidence; it does not select a model, interpret transcripts, poll, retry,
  execute providers, or reach a Forge surface.

  Scenario: Canonical UTF-8 serialization binds the contract
    Given a request with the fixed S01 schema field order
    When its object keys are presented in a different order
    Then canonical serialization and SHA-256 remain identical
    And UTF-8 bytes are hashed without locale conversion

  Scenario: Expected revision is a compare-and-swap gate
    Given a PLANNED runner at revision 0
    When a write arrives with an expected revision other than 0
    Then the reducer returns CAS_MISMATCH
    And the state revision and state hash do not change

  Scenario: Six transport effects have one closed deterministic order
    Given a valid S01 runner
    When TASK_CREATE, TASK_RESUME, TASK_FORK, TASK_SEND, TASK_WAIT, and TASK_READ are acknowledged
    Then no seventh effect can be queued
    And every effect has a stable effect_id and idempotency_key

  Scenario: A duplicate result is an idempotent replay
    Given an ACK has been persisted in the inbox
    When the same effect result is supplied again
    Then no second external effect is recorded
    And a changed result returns IDEMPOTENCY_CONFLICT

  Scenario: An uncertain post-effect state is UNKNOWN
    Given an effect crosses after_transport_before_ack_persist
    When the ACK is not durably known
    Then the phase is UNKNOWN
    And recovery is required
    And retry and replay remain zero

  Scenario: Requested and actual model identity are separate
    Given requested selector gpt-5.6-luna and requested reasoning max
    When no host attestation is present
    Then actual identity is exactly unreported
    And the reducer phase cannot be selected by model or transcript

  Scenario: Negative proofs and counters are measurable
    When the offline deterministic integration fixture completes
    Then Forge reachability, model-selected lifecycle, transcript authority,
      polling, silent retries, duplicate external effects, provider execution,
      spend, network, Git, install, activation, restart, deploy, secrets, and
      destructive effects are all zero
    And the six planned and six acknowledged effects are counted
