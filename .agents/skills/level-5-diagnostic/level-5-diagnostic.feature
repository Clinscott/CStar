Feature: Level 5 Diagnostic
  As a Sovereign System Operator
  I want to run a complete read-only diagnostic of the Corvus Star framework
  So that I can identify legacy rot, missing tests, and structural weaknesses without risking unintended mutations

  Scenario: Execute a full diagnostic scan
    Given the Level 5 Diagnostic skill is activated
    When the diagnostic scans the Kernel, Memory, Estate, Enforcers, Evolutionary, and Autonomous pillars
    Then it must register a Parent Bead for each pillar
    And it must spawn Child Beads to audit specific target files
    And it must generate a "LEVEL_5_DIAGNOSTIC_REPORT.md" artifact
    And it must populate PennyOne with OPEN actionable implementation beads for any discovered issues
    And the file system must not be mutated (except for the report and database inserts)
