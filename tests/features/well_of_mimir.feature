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

  Scenario: Retired CortexLink cannot create a trace
    Given an agent attempts an "ask" command via CortexLink
    When the retired gateway boundary evaluates the request
    Then "legacy_gateway_retired_use_cstar_kernel" should be returned
    And no provider, process, Hall, or trace callback should run.

  Scenario: CStar kernel MCP access
    Given the supported "cstar-kernel" MCP server is active
    When an authorized client invokes a registered read-only tool
    Then it should receive the tool's bounded response
    And no historical Bifrost gateway should be established.
