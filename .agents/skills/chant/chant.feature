Feature: Sovereign Chant Protocol
  The Chant Weave is the primary orchestrator of intent. 
  It must operate through a strict Plan-First and SET-Gate lifecycle to ensure 
  absolute architectural alignment and human oversight.

  Scenario: The Plan-First Batch Requirement
    Given a user issues a high-level architectural request (Chant)
    When the Chant Weave initiates the planning session
    Then it MUST build a complete Global Plan (all Phases and Beads) before any implementation occurs
    And it MUST present the entire implementation graph to the user for structural review

  Scenario: Granular Bead Evolution (Research & Critique)
    Given the Global Plan has been established
    When the system proceeds to a specific Phase or Bead
    Then it MUST perform individual high-fidelity Research for that target
    And it MUST apply an Adversarial Critique to the proposed implementation path
    And it MUST identify any risks or regressions (Logic, Style, Vigil scores)

  Scenario: The SET-Gate Authorization
    Given a bead has undergone Research and Critique
    When the user reviews the bead's status and proposed implementation
    Then the bead MUST remain in the "OPEN" or "SET-PENDING" state
    And it MUST NOT be eligible for implementation by any worker (Hermes/AutoBot)
    Until the user explicitly dictates "SET" for that individual bead

  Scenario: Resilience and State Recovery
    Given a Chant session is interrupted or paused for user review
    When the orchestrator is restarted or a new tick begins
    Then it MUST recover the state of all "SET" beads from the Hall of Records
    And it MUST resume the specific research or implementation cycle without loss of context

  Scenario: The "Plan-First" worker constraint
    Given AutoBot has a constrained 32k context window
    When chant prepares a worker handoff for a "SET" bead
    Then chant must keep the instructions specific to that active bead
    And chant must omit broad repository context that is not needed for the immediate task
