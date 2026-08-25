Feature: Immutable One Mind queued request identity
  Scenario: Ambient provider changes cannot alter a queued delegated request
    Given a delegated request records requested provider and requested surface
    When the ambient host provider changes before fulfillment
    Then the queued requested provider and surface are copied into the execution envelope
    And no alternate provider or surface is selected

  Scenario: Missing or contradictory identity fails before execution
    Given a delegated request lacks immutable identity or contains a stored mismatch
    When One Mind attempts fulfillment
    Then the request is marked failed before an invoker or resolver starts
    And execution_dispatched is false
    And a fresh explicit operator action is required

  Scenario: Every queued identity alias must agree
    Given a delegated request has immutable requested provider and surface metadata
    And any stored provider or surface alias reports a different identity
    When One Mind examines the queued record
    Then the request fails before delegated execution
    And execution_dispatched is false

  Scenario: Returned identity is verified after a dispatched attempt
    Given a delegated attempt has been dispatched once
    When the result reports a different provider or surface
    Then the request fails without retry
    And the actual provider, actual surface, and dispatched state remain recorded

  Scenario: Polling preserves the original execution identity
    Given a queued request has a bound provider, surface, and handle
    When its configured poll bridge resolves the handle
    Then the original requested provider and execution surface remain immutable
    And the poll surface is recorded separately as the last attempt surface

  Scenario: Failed poll evidence preserves the attempted surface
    Given a claimed delegated request has a bound handle and immutable original identity
    When its poll result reports contradictory provider or surface evidence
    Then the request fails after exactly one poll attempt
    And the original execution surface remains immutable
    And the failed record preserves the poll attempt surface and dispatch evidence
