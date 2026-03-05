Feature: Well of Mimir - High Fidelity Intelligence Search
  As the Corvus Star Lead Engineer
  I want a ranked, semantic-aware search engine for file intents
  So that I can quickly find capabilities and logic across the realm.

  Background:
    Given the PennyOne Hall of Records is initialized
    And the FTS5 Search Engine is operational in ".stats/pennyone.db"

  Scenario: High-Fidelity Intent Search
    Given a file "src/core/annex.py" has the intent "Handles secure ingestion and bootstrap protocols."
    And a scan has been successfully completed
    When I run "p1 search 'ingestion protocol'"
    Then the result should include "src/core/annex.py"
    And the result should show the specific intent and interaction protocol.

  Scenario: Well of Mimir Fallback
    Given the SQLite database is temporarily unavailable
    When I run "p1 search 'some capability'"
    Then the system should fallback to a heuristic search of "matrix-graph.json"
    And provide relevant structural matches.

  Scenario: Trace Protocol Synchronization
    Given an agent executes an "ask" command via the CortexLink
    When the daemon processes the request and receives an LLM response
    Then a mission trace should be recorded in the "mission_traces" table
    And the trace should be accessible via "get_recent_traces" RPC call.

  Scenario: Corvus Control MCP Access
    Given the "corvus-control" MCP server is active
    When an LLM client calls the "get_system_vitals" tool
    Then it should receive a JSON payload containing tasks, traces, and suggestions.
    And the Bifrost Gate should be confirmed as established.
