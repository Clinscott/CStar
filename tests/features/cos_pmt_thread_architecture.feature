Feature: CoS and project-context thread architecture
  Scenario: PMTs provide context without owning work
    Given CoS has a Corvus estate goal
    When the target belongs to a project with a mapped PMT
    Then CoS reads one bounded project-context packet
    And PMT availability is a freshness signal rather than an execution gate
    And the PMT grants no ownership, execution, review, approval, or routing authority
    And CoS sends a compact state update after meaningful work
    And the query resolves a role through the versioned model-policy registry and an enforceable selector
    And requested and actual model identity are recorded separately

  Scenario: Current work routes through active CStar spokes
    Given CoS has represented the work in CStar
    When the next bounded action is selected
    Then CStar reserves deterministic effects for bounded native implementation work cells
    And Researcher gathers evidence through authorized lanes
    And CorvusEye performs independent evaluation when required
    And Forge is TOMBSTONED_PERMANENT and historical only
    And MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role

  Scenario: The User is asked only for high-order or red-gated decisions
    Given CoS is executing bounded Green or Yellow work
    When a repair stays inside the authorized boundary
    Then CoS works the issue or records a durable successor repair
    And a missing PMT cannot park or block the goal
    But red gates require explicit CoS or User authorization
