Feature: Legacy Python context effects are retired
  Current CStar context comes from bounded kernel surfaces and explicit inputs.
  Historical Python helpers cannot watch, ingest, synthesize, or persist state.

  Scenario: Sovereign context is a tombstone
    When a caller constructs the former sovereign context
    Then it returns legacy_python_context_effect_surface_retired_use_cstar_kernel
    And no feedback persona HUD trace callback or garbage-collection action begins

  Scenario: Cortex accepts explicit text only
    When a caller parses explicitly supplied document text
    Then it may return detached section tuples within the explicit byte limit
    But constructing the project-polling runtime returns legacy_python_cortex_runtime_retired_use_bounded_cstar_hall_search
    And no project document is discovered read polled or indexed

  Scenario: Direct skill generation is retired
    When a caller records a failure or synthesizes a bridge through the old SkillForge
    Then it returns legacy_python_skill_forge_effect_retired_use_cstar_forge
    And no failure log or generated skill source is written

  Scenario: Directory-backed skill ingestion is retired
    When a caller requests a directory scan or autonomous vector-engine build
    Then it returns legacy_python_skill_directory_scan_retired_use_cstar_skill_registry
    And no path is inspected walked read or indexed
    And explicit intent text may still be parsed into detached metadata

  Scenario: Historical scan callers are tombstones
    When a caller invokes a fishtest profiler diagnostic correction tuner collision or trace engine builder
    Then it returns legacy_python_vector_scan_caller_retired_use_cstar_validation
    And no test dataset skill directory vector runtime report or correction source is accessed
    And direct weight persistence returns legacy_python_weight_tuner_effect_retired_use_cstar_validation
