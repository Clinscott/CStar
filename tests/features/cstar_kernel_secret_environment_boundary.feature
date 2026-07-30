Feature: CStar kernel children receive only bounded non-secret environment state
  The direct-stdio control plane must not inherit provider credentials, shell
  preloads, persona values, or unrelated application configuration.

  Scenario: The supported kernel launcher starts its child
    Given the parent environment contains arbitrary keys, tokens, and secrets
    When the launcher constructs the kernel child environment
    Then only the documented runtime and request-identity allowlist crosses
    And project roots come from the supported launcher rather than ambient state
    And host cognition markers are inactive

  Scenario: A deterministic Python warden is scanned
    Given the kernel process contains unrelated environment state
    When the warden subprocess environment is constructed
    Then no parent key, token, secret, credential, or provider marker crosses
    And the Python process runs with user-site packages disabled

  Scenario: A stale JavaScript Mimir consumer invokes the bridge
    When it supplies shell syntax or a host-model request
    Then the bridge returns a stable retirement result
    And it starts no subprocess and forwards no environment state
