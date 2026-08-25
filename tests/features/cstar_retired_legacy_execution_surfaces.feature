Feature: Retired legacy execution surfaces fail before effects
  CStar must not leave directly importable or executable compatibility paths
  that bypass the kernel-backed Forge, Researcher, and lifecycle boundaries.

  Scenario: TCP MCP compatibility is a tombstone
    Given direct stdio is the only supported CStar MCP transport
    When a caller invokes the former TCP bridge or daemon
    Then it returns a stable retirement error
    And it opens no socket and starts no child process

  Scenario: Read-only CLI startup does not forward ambient secrets
    Given the wrapper receives synthetic secret-bearing environment variables
    When it launches the read-only TypeScript CLI
    Then the child receives none of the synthetic secrets
    And no repository dotenv file is loaded

  Scenario: Sovereign and Python kernel workers are retired
    When a caller invokes a former worker tool or kernel bridge command
    Then the entrypoint returns a stable retirement error
    And it performs no provider, shell, filesystem, Hall, or lifecycle effect

  Scenario: Direct Hermes daemon scripts are retired
    When a caller invokes a former daemon, FIFO sender, or one-shot script
    Then the entrypoint returns a stable retirement error
    And it reads no credential file and starts no Hermes process

  Scenario: Autonomous source and scan scripts are retired
    When a caller invokes bookmark collection, P1 scan, intent harvest, or assurance
    Then the entrypoint returns a stable retirement error
    And it reads no secret or live source
    And it invokes no provider and writes no Hall or project state

  Scenario: ANS ceremony and PennyOne proxy are retired
    When a caller invokes a former wake ceremony or visualization proxy
    Then the entrypoint returns a stable retirement error
    And it starts no timer process listener provider or callback
    And it writes no Hall StateRegistry token or project state

  Scenario: Direct autonomous weave construction is retired
    When a caller directly constructs a former Start Ravens Forge host workflow or maintenance weave
    Then it returns legacy_autonomous_runtime_adapter_retired_use_cstar_kernel
    And every provider process source filesystem Git Hall StateRegistry callback timer listener and network flag is false
    And EstateRitual dispatches neither bookmark-weaver nor host-governor
    And the sovereign heartbeat starts no loop

  Scenario: Ravens stage compatibility remains schema only
    When a caller materializes a deterministic Ravens stage contract
    Then the result is in-memory transitional metadata only
    And it performs no Hall mutation provider process source filesystem Git callback or timer effect

  Scenario: Direct Hall maintenance and seed scripts are retired
    When a caller invokes a former engraver harvester seeder or schema patcher
    Then the entrypoint returns a stable retirement error
    And it reads no host memory or plan source
    And it writes no Hall lifecycle schema gravity or episodic state

  Scenario: Host Augury and Synapse writers are retired
    When a host compatibility path formats Augury or checks Synapse storage
    Then pure Augury formatting may continue without appending a ledger
    And Synapse repair fails before filesystem SQLite backup or schema effects

  Scenario: Sync-slice and Git trainer actions are retired
    When a caller invokes sync-slice or Git gravity training
    Then no Hall source target Git process or gravity state is accessed

  Scenario: The legacy Node deployment helper is retired
    Given a caller supplies a candidate target commit message and callback
    When it requests candidate deployment
    Then the helper returns the stable operator-gated retirement error
    And no file is overwritten and no Git command or callback is invoked
