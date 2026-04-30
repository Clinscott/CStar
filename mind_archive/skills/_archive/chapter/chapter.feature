Feature: Chapter Recreation
  Scenario: Orchestrating turn order and physical blocking
    Given a manuscript chapter is being processed
    When the Recreation Pipeline is triggered
    Then the system MUST define the turn order for all active characters
    And assign physical blocking coordinates for each scene
    And return a structured JSON plan for the Narrator.

  Scenario: Handling invalid chapter structure
    Given a malformed chapter manuscript
    When the pipeline attempts to parse the logic
    Then the system MUST raise a validation error
    And quarantine the malformed sector.
