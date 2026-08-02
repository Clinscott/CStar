Feature: CStar runtime generation handshake and stale-handle recovery

  Scenario: A stale mutation handle is rejected before a write
    Given a kernel runtime receipt for generation 1
    And the host has observed generation 2
    When the host submits a mutation bound to generation 1
    Then the kernel rejects it as stale_runtime_generation
    And the mutation writer has not run

  Scenario: A fresh handle matches the current generation
    Given a kernel runtime receipt for the current generation
    When the host submits a mutation bound to that generation
    Then the mutation is allowed

  Scenario: Generation values are monotonic
    Given a sequence of explicit kernel launches
    When each launch issues a receipt
    Then every generation is greater than the previous generation

  Scenario: Source and package evidence are part of the binding
    Given a current receipt with source and package fingerprints
    When the host reattaches with different source or package evidence
    Then the reattach is rejected before replay

  Scenario: Reattach replay is zero-provider and idempotent only
    Given a stale handle and a current receipt
    When the host explicitly reattaches
    Then only idempotent work with zero provider attempts may replay

  Scenario: Source watching is bounded and cancellable
    Given an explicitly enabled event-driven source watcher
    When the watcher is closed or reaches its event bound
    Then it stops observing without polling, reloading, activation, or mutation

  Scenario: Root normalization is deterministic across supported hosts
    Given equivalent Linux, WSL, and macOS path spellings
    When the paths are normalized
    Then equivalent roots have stable comparable identities
