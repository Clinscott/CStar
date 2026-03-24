Feature: Vector Search Engine
  Scenario: Resolving semantic intent across multiple spokes
    Given the SovereignVector engine is initialized
    When a natural language query is scoured
    Then the system MUST route the query to the optimal domain spoke
    And the results MUST be scored using the hybrid Calculus model
    And the top result MUST be returned with its metadata and trigger.

  Scenario: In-Memory Caching for recurrent queries
    Given a query has been successfully resolved
    When the same query is repeated within the same session
    Then the system MUST return the result from the _search_cache
    And bypass the expensive semantic search spokes.
