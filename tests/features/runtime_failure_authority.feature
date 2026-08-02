Feature: Runtime failure authority
  A failed runtime action cannot spend, retry, replan, or cross ownership
  boundaries without a fresh top-level operator invocation.

  Scenario: A kernel adapter returns failure
    Given one kernel-backed adapter execution is authorized
    When the adapter returns a failure
    Then the original failure is preserved
    And the adapter was called exactly once
    And no host provider or governor is invoked
    And a fresh operator action is required for retry or replan

  Scenario: Agent-native activation fails
    Given a capability is owned by the host
    When the host provider is missing or activation fails
    Then the failure is terminal for that invocation
    And no kernel fallback executes

  Scenario: A capability is a host workflow
    Given a stale registry field allows kernel fallback
    When the capability is invoked through the runtime dispatcher
    Then ownership remains host-only
    And no kernel adapter executes

  Scenario: Ravens supervision cannot widen or recover an execution
    Given an operator explicitly requested host supervision for one exact Ravens action and target
    When the supervisor fails, returns invalid output, or changes that request
    Then the supervisor request is recorded as dispatched
    But the Ravens maintenance action is recorded as not dispatched
    And no repository discovery or local cycle executes
    And a fresh operator action is required

  Scenario: Provider presence does not trigger Ravens supervision
    Given an active host provider exists
    When the operator invokes Ravens without the explicit host-supervision flag
    Then no supervisor request is dispatched
    And the exact Ravens action runs only through its requested kernel lane

  Scenario: Persona style changes
    Given CStar projects a different active persona
    When the dispatcher records its execution bead
    Then the assigned execution actor is unchanged by persona
    And persona grants no retry, routing, risk, or execution authority

  Scenario: Recoverable local dispatch failure queues bounded repair
    Given the host owns a leased dispatch for one exact mission and batch
    When local delivery preparation fails before provider start
    Then CStar records REPAIR_QUEUED on that same mission and batch
    And no manual relay or fresh user gate is required for the repair queue
    And the bounded zero-provider replay ceiling remains enforced

  Scenario: Ambiguous-spend recovery is frozen
    Given provider start or spend is ambiguous
    When runtime failure recovery runs
    Then the durable dispatch becomes UNKNOWN
    And no provider retry or automatic repair is dispatched
