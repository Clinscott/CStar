Feature: Canonical Codex integration lineage
  CStar must expose one canonical kernel inventory and one unambiguous
  Codex transport registration without treating an MCP child as an interactive
  host session.

  Scenario: One catalog describes every public kernel tool
    Given the typed kernel tool catalog contains unique unconditional tool names
    When the runtime registers its public MCP tools
    Then the registered names and descriptions equal the catalog projection
    And source-launched tool discovery equals the same catalog
    And generated host guidance derives its inventory from that catalog
    And decommissioned AutoBot is absent from every projection

  Scenario: Codex has one runtime registration
    Given the global Codex WSL wrapper is the supported CStar registration
    When tracked estate and plugin integration surfaces are generated
    Then the estate project configuration does not override cstar-kernel
    And the Corvus Star plugin contains its skill but no hook or MCP registration
    And the wrapper launches the source-backed bridge

  Scenario: Supported kernel MCP children are not interactive host sessions
    Given a supported generated CStar launcher inherits Gemini, Codex, Claude, or Droid host markers
    When it starts the bounded CStar MCP implementation
    Then passive host identity state is scrubbed without removing unrelated security constraints
    And authority markers are seeded with explicit inactive sentinels
    And Node and Python bootstrap reassert neutrality after dotenv loading
    And CORVUS_HOST_SESSION_ACTIVE is false
    And Python host capability resolves to HEADLESS before interactive checks
    And kernel and watch-control markers remain bounded and explicit

  Scenario: TCP bridge shutdown is absolutely bounded
    Given bridge stdin closes while TCP requests or reconnect attempts remain pending
    When the absolute drain deadline expires
    Then every pending request receives a bounded JSON-RPC error
    And late reconnect sockets are destroyed before attachment
    And the bridge closes its socket and exits nonzero

  Scenario: Plugin promotion is immutable and recoverable
    Given a generated Corvus Star plugin has a versioned lineage manifest
    When the local installer stages that plugin
    Then invariant plugin files match their recorded hashes
    And a same-version different-lineage payload is rejected before replacement
    And a repeated identical install is idempotent
    And a failed promotion restores the previous plugin and marketplace state

  Scenario: Source repair does not imply live activation
    Given the tracked source repair has passed focused validation
    Then home configuration, installed plugins, Codex cache, and live processes remain unchanged
    And installation, marketplace reconciliation, and restart require a later operator decision
