Feature: Retired Python intelligence router
  As the CStar control-plane operator
  I want the historical Python router to fail closed
  So that providers and lifecycle work cannot bypass cstar-kernel

  Scenario: Historical Mimir and cognitive routes are terminal
    Given no Python intelligence-router execution authority
    When MimirClient or CognitiveRouter is invoked
    Then "legacy_python_intelligence_router_retired_use_cstar_kernel" is returned
    And no provider, process, Hall, state, source, filesystem, or callback work begins
