Feature: StateRegistry is a read-only Hall compatibility projection
  Legacy host state must not bypass request-classified CStar lifecycle tools.

  Scenario: Status reads compatibility state
    Given Hall contains bounded repository spoke and agent records
    When StateRegistry builds its compatibility view
    Then it reads only canonical Hall tables
    And it ignores legacy sovereign JSON and arbitrary projection metadata

  Scenario: A caller requests a StateRegistry mutation
    When it calls updateMission updateFramework postToBlackboard pushTerminalLog or save
    Then it returns legacy_state_registry_mutation_retired_use_cstar_kernel
    And it performs no Hall filesystem blackboard spoke presence or coordination effect

  Scenario: Hall context is unavailable
    When status cannot open a safe existing Hall store
    Then it returns an inert compatibility projection
    And it does not create Hall state or fall back to legacy JSON
