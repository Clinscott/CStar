Feature: Augury active state recovery
  Scenario: Runtime Augury contracts recover missing intent categories
    Given a runtime execution bead has an Augury contract with a selection tier and selection name
    And the contract is missing intent_category
    When the active Augury state is rendered for doctor, explain, status, or handoff
    Then CStar infers intent_category from the registry intent grammar
    And the active Augury route is not blocked by missing intent_category

  Scenario: Augury doctor exposes a typed guardrail verdict
    Given active Augury diagnostics have evaluated route, scope, expert, Mimir, and noise checks
    When the active Augury state is rendered for doctor or explain
    Then CStar exposes a guardrail verdict of allow, caution, or block
    And host agents can use the guardrail action without parsing warning strings
