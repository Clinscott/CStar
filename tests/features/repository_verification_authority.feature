Feature: CStar-owned repository verification

  Scenario: GitHub remains a repository rather than a verification authority
    Given CStar source and pull requests are stored in GitHub
    When a bounded change is prepared for review
    Then npm run verify is the canonical acceptance command
    And it writes a platform-labelled local verification receipt
    And no GitHub Actions workflow is tracked

  Scenario: Future worker links remain inert until the server is available
    Given the mature Researcher and Forge profiles are unavailable
    When the preliminary worker contract is inspected
    Then worker jobs remain default-off
    And enabled preliminary jobs report execution_available as false
    And CStar does not infer profiles, credentials, OAuth state, endpoints, commands, or host paths
