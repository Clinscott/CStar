Feature: Neutral native task control
  The interpreter is deterministic and has no host, provider, clock, or
  lifecycle side effect.

  Rule: A scope has one generation-fenced controller
    Scenario: A stale controller cannot dispatch
      Given an active cstar.native_controller_lease.v1
      When a START event uses a stale controller generation
      Then the event is rejected with CSTAR_NATIVE_TASK_STALE_CONTROLLER
      And the scope circuit breaker is OPEN

  Rule: Terminal barriers are atomic
    Scenario: Cancellation accepts one terminal acknowledgement
      Given a cancel transition has set the termination barrier
      When one CANCEL_ACK event is received for the active generation
      Then the scope is TERMINAL
      And a later START event is rejected

  Rule: Unchanged goals cannot loop
    Scenario: Complete followed by start opens the breaker before dispatch
      Given a task completed under goal generation 1
      When START is received for the same task and goal generation 1
      Then the event is rejected with CSTAR_NATIVE_TASK_GENERATION_LOOP
      And no dispatch is eligible

  Rule: Cohort waiting is bounded
    Scenario: Timeout freezes a cohort
      Given one immutable cohort wait has been accepted
      When TIMEOUT is received for that cohort
      Then the cohort is FROZEN
      And a late event is rejected

  Rule: Policy inheritance only narrows authority
    Scenario: A child cannot widen an allowlist
      Given a root policy and a child policy
      When the child adds an item outside the root allowlist
      Then policy resolution fails with CSTAR_NATIVE_TASK_POLICY_WIDENING
