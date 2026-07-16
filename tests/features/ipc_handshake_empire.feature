Feature: Retired historical gateway and IPC bridge
  As the CStar control-plane operator
  I want the historical Node gateway to fail closed
  So that lifecycle work cannot bypass cstar-kernel

  Scenario: CortexLink construction is terminal before IPC
    Given the historical gateway has no execution authority
    When CortexLink construction is attempted
    Then the stable gateway retirement error is returned
    And no IPC executor is invoked
