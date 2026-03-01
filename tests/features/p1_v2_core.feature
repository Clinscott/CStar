Feature: PennyOne v2.0 Autonomic Nervous System
  As the Corvus Star Lead Engineer
  I want a headless, temporal-aware repository intelligence system
  So that agents have continuous spatial and historical awareness.

  Scenario: Headless Daemon Ignition
    Given the repository is initialized
    When I run "p1 start"
    Then a PID file should be created in ".stats/p1-daemon.pid"
    And the daemon should begin monitoring the file system.

  Scenario: Temporal Gravity Fusion (4D Matrix)
    Given a file has "5" commits in the last 30 days
    And the file has "50" lines modified in the last 7 days
    And the file has "2" active agent pings in the last 48 hours
    When the Gungnir Gravity calculation is executed
    Then the file's Gravity [G] should be calculated as "17". # (2*5) + (0.1*50) + (1.0*2) = 10 + 5 + 2 = 17

  Scenario: Decoupled Data Lake Ingestion
    Given the P1 Daemon is active
    When the Daemon recalculates the Matrix and writes to ".stats/matrix-graph.json"
    Then the Daemon should broadcast "MATRIX_UPDATED" via the CortexLink WebSocket bridge.

  Scenario: Standardized Semantic Intelligence (LSIF/SCIP)
    Given a repository with complex cross-file dependencies
    When the PennyOne Semantic Indexer is executed
    Then it should produce a SCIP or LSIF compatible index
    And the "matrix-graph.json" should contain pixel-perfect dependency links
    And the "logic" score should reflect cyclomatic complexity derived from semantic analysis.

  Scenario: Active Threat Assessment (Automated Bounties)
    Given a file has a Gravity score higher than "100"
    And the file has a Logic score lower than "4.0"
    When the PennyOne Warden module evaluates the Matrix
    Then it should identify the file as a "Toxic Sector"
    And it should inject a prioritized refactoring bounty into ".agent/tech_debt_ledger.json"
    And the bounty should include the file path and the specific architectural justification.

  Scenario: Raven-Ledger Synchronization
    Given the "tech_debt_ledger.json" contains a "CRITICAL" bounty for "src/core/sv_engine.py"
    When the Muninn agent initiates a repair cycle
    Then it should prioritize the mission from the ledger over a general hunt
    And it should focus the forge on the specific architectural justification provided.

  Scenario: Silence Protocol Enforcement
    Given the repository has a file write event within the last "2" minutes
    When the Muninn agent attempts to take flight
    Then it should remain on standby and wait for the silence threshold of "5" minutes.

  Scenario: Automated Breach Escalation
    Given a target file has failed the Crucible "3" times
    When the Muninn agent handles the final failure
    Then it should flag the file as "BLOCKED_STUCK" in the Tech Debt Ledger
    And it should escalate the mission to the Main Agent [ODIN].
