Feature: Retire the Python CStar dispatcher packaging bypass
  The Node CStar kernel is the canonical command and lifecycle surface.
  The former Python dispatcher must remain import-compatible without retaining
  discovery, bootstrap, process, source, environment, or state side effects.

  Scenario: Importing the compatibility module is inert
    Given the former Python dispatcher module is not loaded
    When a caller imports the Python dispatcher compatibility module
    Then the import succeeds without bootstrap or environment mutation
    And no retired runtime dependency is loaded by that import

  Scenario: Every stale dispatcher invocation fails closed
    Given a caller reaches the retired Python dispatcher compatibility class
    When the caller constructs, discovers, displays, runs, or records through it
    Then the operation fails with "legacy_python_cstar_dispatcher_retired_use_node_kernel"
    And no filesystem, process, source, provider, callback, or Hall action starts

  Scenario: Python packaging cannot shadow the canonical CStar command
    Given the project publishes the canonical Node CStar executable
    When Python package console metadata is inspected
    Then no Python console entry named "cstar" is present
    And no Python console entry targets the retired dispatcher module
