Feature: Retired orphan packaging and dogfood scripts
  Scenario: Historical utility scripts cannot bypass current authority
    Given an obsolete direct bead dogfood or packaging script
    When the compatibility entrypoint is invoked
    Then it returns its stable retirement failure
    And no child, source, state, Hall, SQLite, Git, install, provider, or network effect starts

  Scenario: Historical cascading context cannot read ambient parent or home files
    Given the host owns instruction discovery
    When the compatibility context loader is invoked
    Then it returns legacy_cascading_context_loader_retired_use_host_instruction_surface
    And no project, parent, home, or instruction file is read
