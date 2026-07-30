Feature: Setup and installation remain operator-gated
  A generated source bundle does not authorize host mutation.

  Scenario: A caller stages verified Codex plugin source
    Given the personal marketplace already contains exactly one approved local corvus-star source entry
    When the bounded source-staging helper validates lineage and stages the plugin under the personal source root
    Then it does not create or mutate marketplace config Codex cache activation restart or process state
    And Codex installation and activation remain separate operator-gated host actions

  Scenario: Codex source staging is not prepared
    Given the personal marketplace entry is absent invalid or ambiguous
    When the bounded source-staging helper is invoked
    Then it fails before creating the personal plugin source root

  Scenario: A caller invokes a retired direct installer or local setup helper
    When it requests Gemini linking venv creation dependency installation or npm linking
    Then the matching stable retirement error is returned
    And no host config marketplace environment credential package filesystem or process effect occurs

  Scenario: A caller invokes a legacy Codex repair sidecar
    When it requests self-heal launcher smoke or activity tracking
    Then the matching stable retirement error is returned
    And no state log timer launcher plugin install or restart occurs

  Scenario: Source distribution validation passes
    Then installation activation restart deployment and production claims remain separately gated
