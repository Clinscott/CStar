Feature: State-only Codex-hosted Forge and Researcher runtime lineage

  CStar records bounded host-workflow receipts. It does not launch cognition,
  own a provider, own credentials, or treat the historical Hermes/MiniMax
  runtime as current readiness.

  Scenario: Current Forge and Researcher jobs are owned by Codex-hosted Luna Max
    Given the runtime manifest declares runner_owner "codex-host"
    And the requested model is "gpt-5.6-luna" with reasoning "max"
    And selector_status is "enforced"
    And actual_identity is recorded separately or remains unreported
    And provider_requests_started is zero
    Then the deterministic host receipt is actionable

  Scenario: Current worker contracts accept only the Codex-host transport
    Given the runner_owner is "codex-host"
    When transport is "hermes:x-grok"
    Then the current worker contract rejects the transport
    And Hermes remains readable only through explicitly labeled legacy v2 history
    And MM remains inactive

  Scenario: Legacy Hermes/MiniMax runtime evidence remains readable only as history
    Given a v1 manifest contains Hermes credentials and MiniMax model fields
    Then the compatibility decoder may read its bytes
    But current Forge readiness remains false
    And no executable launcher is selected by the v2 manifest
