Feature: Retired host and model compatibility paths
  Historical host/model adapters must not bypass the CStar lifecycle.

  Scenario: One Mind compatibility is inert
    Given a caller imports the historical One Mind broker or fulfillment API
    When it requests broker activation, queue fulfillment, or telemetry mutation
    Then it receives legacy_one_mind_compatibility_retired_use_cstar_kernel
    And no Hall, Synapse, StateRegistry, provider, process, source, or callback is touched

  Scenario: Host provider delegation is inert
    Given a caller supplies provider, bridge, runner, and callback dependencies
    When it requests host intelligence, Mimir routing, or delegated execution
    Then it receives legacy_host_provider_delegation_retired_use_cstar_kernel
    And execution_dispatched is false
    And no alternate provider or execution surface is selected

  Scenario: Agent-native dispatch remains host-owned
    Given a skill is cataloged as agent-native
    When the historical runtime dispatcher is invoked directly
    Then it receives legacy_agent_native_dispatch_retired_use_host_skill_surface
    And all effect flags are false

  Scenario: Blackboard compaction cannot call a model
    Given a caller requests historical blackboard compaction
    When the compatibility manager handles the request
    Then it receives legacy_blackboard_compaction_retired_use_cstar_kernel
    And no state or provider callback is touched

  Scenario: Ambient host capability inference is terminal
    Given environment variables or imported modules imply a host capability
    When the historical adaptive environment adapter is constructed
    Then it receives legacy_environment_adapter_retired_use_host_enforceable_capabilities
    And no delegation, JIT injection, or model selection is inferred
