Feature: Chant Skill
  Scenario: Chant routes implementation through AutoBot
    Given chant has crystallized a concrete sovereign bead
    When chant hands the bead off for implementation
    Then autobot must be the worker skill
    And the handoff must contain only immediate Hall and PennyOne context

  Scenario: Bead briefs respect the AutoBot window
    Given AutoBot has a constrained 32k context window
    When chant prepares a worker handoff
    Then chant must keep the instructions specific to the active bead
    And chant must omit broad repository context that is not needed for the next edit
