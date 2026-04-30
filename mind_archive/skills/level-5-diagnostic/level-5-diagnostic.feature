Feature: Level 5 Diagnostic
  As a Sovereign System Operator
  I want to run a complete read-only diagnostic of the Corvus Star framework
  So that I can identify legacy rot, missing tests, and structural weaknesses without risking unintended mutations

  Scenario: Execute a full diagnostic scan
    Given the Level 5 Diagnostic skill is activated
    When the diagnostic scans the Kernel, Memory, Estate, Enforcers, Evolutionary, and Autonomous pillars
    Then it must group findings by pillar
    And it must identify child-level follow-up targets
    And it must fail loud on stale shell chant references, direct host provider bypasses, and non-hermetic unit tests
    And it must generate "LEVEL_5_DIAGNOSTIC_REPORT.md" and "LEVEL_5_DIAGNOSTIC_FINDINGS.json" artifacts
    And it must not print or invoke a shell "cstar chant" handoff
    And it must not populate PennyOne or mutate hooks, settings, source, or manifests
    And the file system must not be mutated except for the diagnostic artifacts
