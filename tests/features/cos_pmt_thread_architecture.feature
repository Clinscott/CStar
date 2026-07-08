Feature: CoS and PMT thread architecture
  Scenario: CStar Console, Researcher, and Forge stay separated
    Given CoS has a Corvus estate goal
    When CoS routes the goal to a PMT
    Then CStar Control Plane PMT owns only CStar and cstar-console control-plane surfaces
    And Researcher PMT owns research and evidence production
    And Corvus Forge PMT owns build and implementation delivery
    And CorvusEye Review PMT owns independent review and audit
    And MM Estate Synthesis is not a routine relay requirement

  Scenario: The User is asked only for high-order or red-gated decisions
    Given a PMT is executing a bounded Green or Yellow repair
    When the PMT can continue inside its domain
    Then CoS does not ask the User for routine blocker handling
    And CoS parks or blocks the goal until a review packet returns
    But red gates require explicit CoS or User authorization
