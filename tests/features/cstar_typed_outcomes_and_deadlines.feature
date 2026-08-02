Feature: CStar typed outcomes and bounded read deadlines

  Rule: Typed outcomes are observable without confusing domain results with MCP failures

    Scenario: The response contract exposes the six supported outcomes
      When a kernel response is built for an outcome
      Then the outcome is one of "ok", "needs_input", "guardrail_block", "domain_terminal", "transport_error", or "internal_error"
      And guardrail, domain, transport, and internal categories are telemetry-visible

    Scenario: Preauthorization and domain terminal results remain normal MCP results
      When a preauthorization guardrail or domain terminal response is returned
      Then the response has no MCP isError flag

    Scenario: Transport and internal failures are MCP errors
      When a transport or internal outcome is returned
      Then the response has MCP isError set to true

  Rule: Read operations are bounded and cancellable

    Scenario: A read deadline is clamped
      When a read requests no deadline
      Then the default deadline is 5 seconds
      And no requested deadline can exceed 30 seconds

    Scenario: A read timeout is deterministic
      When a read outlives its bounded deadline
      Then it is classified as a timeout transport error
      And its child AbortSignal is aborted

    Scenario: Caller cancellation propagates
      When the caller aborts an active read
      Then the read observes the same cancellation
      And the result is classified as a cancellation transport error

    Scenario: Completion wins before timeout cleanup
      When a read completes before its deadline
      Then the completed value is returned
      And a later caller cancellation cannot abort the completed child signal
