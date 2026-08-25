Feature: MCP telemetry is bounded non-authoritative evidence
  Usage reporting must not grow or read an unlimited sidecar.

  Scenario: Telemetry receives events over time
    When a JSONL segment reaches 2 MiB
    Then the next bounded record starts a fresh rolling segment
    And summary reads never load more than 2 MiB per stream

  Scenario: A telemetry path is unsafe
    Given the root agents state directory or file is symlinked or hardlinked
    When a tool emits best-effort telemetry
    Then the telemetry write fails closed
    And the tool lifecycle result is unchanged

  Scenario: A caller has not crossed a Forge authority boundary
    Given Forge returns a stable machine-readable error_code with a private non-recordable disposition
    When request identity, the exact hash challenge, or current-authorizing-turn proof is rejected
    Then no usage or usefulness JSONL is written
    And no Hall or SQLite state is created
    And receipt-state distinctions are not exposed before exact authorization
    But an identity-gated replay with matching immutable authorization receipt lineage and idempotency may return only an already durable no-spend attempt

  Scenario: Error text is attacker controlled
    Given an ordinary post-boundary error resembles a historical preauthorization prefix
    When instrumentation receives the untrusted error string without the private disposition
    Then the bounded failure event remains recordable
    And raw errors paths stacks challenges and authorization material are not stored
