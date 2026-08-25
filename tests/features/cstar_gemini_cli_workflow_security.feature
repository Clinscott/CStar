Feature: CStar Gemini CLI workflow security boundary

  Scenario: Headless workspace trust follows tool hardening
    Given a Gemini workflow needs headless workspace trust
    When the workflow invokes Gemini CLI
    Then trust is enabled only on that action step
    And the model has no core shell tool
    And checkout credentials are not persisted

  Scenario: Untrusted input is demarcated as JSON data
    Given issue, pull request, or operator text is untrusted
    When a credentialless preparation step serializes the context
    Then the command reads only the bounded JSON context
    And command-time shell interpolation is absent

  Scenario: Triage separates analysis from effects
    Given Gemini analyzes issue text without a GitHub token
    When it returns proposed labels
    Then a separate deterministic step filters labels against repository labels
    And scheduled triage accepts only the exact candidate issue numbers
    And malformed output fails before any label mutation

  Scenario: Approval cannot bypass CStar Forge
    Given a maintainer approves a Gemini plan
    When the planning workflow runs
    Then it has read-only repository authority
    And it posts a bounded CStar Forge handoff without implementation
