Feature: PennyOne v2.0 Autonomic Nervous System
  As the Corvus Star Lead Engineer
  I want a headless, temporal-aware repository intelligence system
  So that agents have continuous spatial and historical awareness.

  Scenario: Headless Daemon Ignition
    Given the repository is initialized
    When I run "p1 start"
    Then a PID file should be created in ".stats/p1-daemon.pid"
    And the daemon should begin monitoring the file system.

  Scenario: Temporal Gravity Fusion
    Given a file has "5" commits in the last 30 days
    And the file has "2" active agent pings
    When the Gungnir Scan is executed
    Then the file's Gravity [G] should reflect both historical churn and live telemetry.

  Scenario: Decoupled Data Lake Ingestion
    Given the P1 Proxy is active on port "4000"
    When the Daemon writes to ".stats/matrix-graph.json"
    And the signal file "p1-refresh.signal" is updated
    Then the Proxy should broadcast "MATRIX_UPDATED" via WebSocket.
