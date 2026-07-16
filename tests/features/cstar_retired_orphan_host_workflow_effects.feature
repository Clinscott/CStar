Feature: Orphan host workflow implementations fail before effects
  A retired adapter must not leave a directly importable bypass behind it.

  Scenario: A caller invokes the former Chant implementation
    When it calls the planning loop proposal writer or architect service
    Then the matching legacy_chant or legacy_architect retirement error is returned
    And no provider callback source filesystem Hall or dispatch effect occurs

  Scenario: A caller invokes HostGovernor candidate discovery
    Then it returns legacy_host_governor_candidates_retired_use_cstar_handoff
    And it reads no target starts no process and queries no Hall state

  Scenario: A caller invokes a PennyOne discovery or intent refresh helper
    Then it returns the matching legacy_pennyone retirement error
    And it performs no Git filesystem source provider report or Hall effect

  Scenario: A caller invokes the economy ledger
    Then it returns legacy_economy_effect_surface_retired_requires_operator_gate
    And it mutates no memory console KeepOS or filesystem state
