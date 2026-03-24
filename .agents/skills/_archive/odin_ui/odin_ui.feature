Feature: Odin Protocol UI
  Scenario: Displaying empire status
    Given the Odin Protocol game loop is active
    When the UI is requested to render the battle grid
    Then the system MUST display the current player stats (Strength, Intel, etc.)
    And the current campaign node and domination percentage MUST be visible.

  Scenario: Cinematic Transitions
    Given a persona shift or major game event
    When the UI triggers a transition
    Then the system MUST execute a 3-phase ANSI animation
    And the HUD color palette MUST update to match the active persona.
