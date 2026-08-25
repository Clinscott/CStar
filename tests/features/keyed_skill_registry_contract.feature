Feature: Keyed skill registry contract
  The capability key is the canonical public identity of every CStar registry entry.

  Scenario: The authoritative registry preserves named capability identity
    Given the authoritative registry contains only current reviewed host capabilities
    When CStar loads the registry for capability discovery
    Then entries must be a keyed object rather than an array
    And the capability manifest must expose corvus-forge, researcher, and cstar-closeout rather than numeric indexes
    And skill-info for mimir-harvester must fail closed because model-written lesson harvesting is decommissioned

  Scenario: Malformed registry entries fail closed
    Given a registry declares the entries field
    When entries is an array, null, or contains an invalid capability record
    Then CStar must reject the registry with a skill-registry contract error
    And CStar must not fall back to a legacy skills field
    And runtime bootstrap must not silently ignore the schema violation

  Scenario: Registry keys and embedded identifiers cannot diverge
    Given a keyed registry entry includes an id field
    When the embedded id differs from its capability key
    Then CStar must reject the registry before routing or discovery
