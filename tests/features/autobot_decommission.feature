Feature: AutoBot public-surface decommissioning
  Scenario: Legacy environment flags cannot restore AutoBot routing
    Given AutoBot has been removed from the CStar skill registry
    And its host skill manifest has been replaced by a decommission tombstone
    When cstar-kernel starts with any legacy AutoBot enablement variables
    Then cstar_autobot must not appear in MCP tool discovery
    And the compatibility handler must fail closed without invoking a subprocess

  Scenario: Registry auditing preserves the decommission decision
    Given historical AutoBot scripts remain for forensic or gated Forge compatibility
    When the skill registry auditor scans authoritative skill directories
    Then a directory bearing the decommission marker must not become an active skill
    And direct AutoBot invocation must remain forbidden
