Feature: CStar runtime effects are classified and contained
  Local process execution, source watching, and diagnostic persistence must not
  hide behind read labels or ambient runtime state.

  Scenario: A caller inspects the Warden tool catalog
    When the kernel publishes the cstar_warden surface
    Then the tool is classified EXECUTION because scan starts a local process
    And list and bounties remain bounded read-only actions

  Scenario: A Warden scan resolves its Python interpreter
    Given an ambient executable path outside the repository virtual environment
    When the kernel resolves the scan interpreter
    Then it rejects the ambient executable
    And only the canonical repository-venv interpreter may run

  Scenario: The host starts the kernel without development watch authorization
    When the kernel evaluates its source watcher configuration
    Then the watcher remains disabled by default
    And a source edit cannot terminate the host-managed process

  Scenario: Kernel bootstrap fails with a secret-bearing stack
    When the bootstrap diagnostic record is formatted
    Then only an allowlisted error code and truncated fingerprint are retained
    And no raw message, stack, path, or environment value is persisted

  Scenario: The full Node validation suite is invoked
    When package scripts expand CStar kernel unit tests
    Then every test file under the kernel unit-test directory is discovered
    And no hand-maintained partial kernel test list can mask a regression
