Feature: CoS and project-context thread architecture
  Scenario: PMTs provide context without owning work
    Given CoS has a Corvus estate goal
    When the target belongs to a project with a mapped PMT
    Then CoS reads one bounded project-context packet
    And PMT availability is a freshness signal rather than an execution gate
    And the PMT grants no ownership, execution, review, approval, or routing authority
    And CoS sends a compact state update after meaningful work
    And the query requests Luna, Terra, or Sol only through an enforceable selector
    And requested and actual model identity are recorded separately

  Scenario: Current work routes through active CStar spokes
    Given CoS has represented the work in CStar
    When the next bounded action is selected
    Then Forge builds implementation through the durable Forge path
    And Researcher gathers evidence through authorized lanes
    And CorvusEye performs independent evaluation when required
    And MM has no active routing or relay role

  Scenario: The User is asked only for high-order or red-gated decisions
    Given CoS is executing bounded Green or Yellow work
    When a repair stays inside the authorized boundary
    Then CoS works the issue or records a durable successor repair
    And a missing PMT cannot park or block the goal
    But red gates require explicit CoS or User authorization
