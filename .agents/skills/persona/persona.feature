Feature: Persona Management
  Scenario: Switching between active framework personas
    Given the Corvus Star framework is active
    When the PersonaManager is called with a target persona name (ODIN or ALFRED)
    Then the system MUST update .agents/config.json with the new persona
    And the SovereignHUD theme MUST synchronize with the target's aesthetics
    And the Gungnir Oracle MUST acknowledge the identity shift.

  Scenario: Validating persona existence
    Given a list of authorized personas in the registry
    When a user attempts to set an unauthorized persona
    Then the system MUST reject the change
    And maintain the current active persona.
