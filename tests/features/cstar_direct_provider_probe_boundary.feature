Feature: Direct provider probe boundary
  Legacy diagnostics do not activate providers from ambient secrets.

  Scenario: The orphan ADC probe is terminal
    Given the retired direct ADC provider probe
    When an operator invokes it
    Then it fails before environment, dotenv, filesystem, provider, or network access

  Scenario: The Odin game client defaults offline
    Given an ambient provider key exists
    When the Odin game client receives no explicit key
    Then no live provider client is activated
