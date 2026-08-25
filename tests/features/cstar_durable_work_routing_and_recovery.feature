Feature: Durable CStar work routing and recovery
  CStar kernel owns durable lifecycle transitions. The retired Node execution
  topology remains visible only as fail-closed compatibility source.

  Scenario Outline: Pure classification names the durable request boundary
    Given a work item classified as "<work_class>"
    When the read-only route classifier is evaluated
    Then it recommends "<request_tool>"
    And it records no activation or lifecycle transition

    Examples:
      | work_class     | request_tool             |
      | implementation | cstar_forge_request      |
      | evidence       | cstar_researcher_request |

  Scenario: Routine Node bootstrap exposes an empty legacy adapter inventory
    Given the Node runtime is bootstrapped
    Then its exact registered adapter inventory is empty
    And bootstrap performs no environment, Hall, state, provider, or process write
    And no registry entry can dynamically restore a legacy adapter

  Scenario Outline: Unsupported runtime identifiers fail before effects
    Given a runtime request names the "<identifier_class>" identifier "<identifier>"
    When the generic dispatcher evaluates the request
    Then it fails closed with execution_dispatched false
    And hall_mutation_started is false
    And no Hall, state, provider, callback, process, source, checker, or Git activity starts

    Examples:
      | identifier_class | identifier            |
      | unknown          | weave:unknown         |
      | retired          | weave:orchestrate     |
      | retired          | weave:host-governor   |
      | host-only        | corvus-forge          |

  Scenario: Legacy dynamic CLI discovery is a tombstone
    Given Python scripts, workflows, and registry entrypoints exist on disk
    When legacy dynamic command discovery and execution are requested
    Then discovery returns no executable commands
    And execution fails closed before Python or another process starts
    And the error directs the operator to the supported CStar surface

  Scenario: Generic registry and Python adapters are tombstones
    Given a registry entry names a kernel-backed Python script
    When either the universal adapter or Python adapter is constructed directly
    Then both return the stable retired-adapter failure
    And execution, Hall, provider, process, and source effect flags are false
    And no filesystem discovery, process, provider, Hall, source, or callback effect starts

  Scenario: Durable lifecycle transitions are kernel-only
    Given a bounded runtime identifier is evaluated by the generic dispatcher
    Then the dispatcher does not create, claim, update, finalize, or resolve a Hall bead
    And the dispatcher does not update global mission or agent state
    And durable lifecycle state changes require the matching cstar-kernel tool

  Scenario: Reaper classifies failed work without changing lifecycle state
    Given a bead assigned to its original worker
    When a prior worker attempt fails or times out
    Then a pure classifier proposes BLOCKED
    And no Hall lifecycle row is read or written
    And its original assignment appears in the proposed recovery reason
    And the triage reason suggests recovery through the durable request boundary

  Scenario: Legacy completion reconciliation cannot persist a receipt
    Given a bead reaches READY_FOR_REVIEW through cstar-kernel
    When legacy completion reconciliation is invoked
    Then it fails before Hall memory validation provider Git or dispatch activity
    And result validation remains an explicit cstar_record_result operation
