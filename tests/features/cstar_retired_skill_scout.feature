Feature: Retired Skill Scout authority boundary
  Scenario: A legacy acquisition pointer cannot activate work
    Given Skill Scout is absent from the current skill registry
    When a request resembles its historical acquisition intent
    Then the compatibility document exposes no activation or execution surface
    And it grants no web, file-write, installation, or package authority

  Scenario: Current acquisition work uses governed CStar lanes
    Given an operator requests new external evidence
    Then CoS creates a bounded request through an authorized Researcher lane
    And reusable implementation follows the durable Forge lifecycle
    And independent validation is required before lifecycle completion
