Feature: Hall reads and bead transitions have bounded persistence effects
  CStar READ-class surfaces must never bootstrap or migrate Hall, and bead
  lifecycle persistence must not fan out into legacy state or coordination.

  Scenario: A READ handler encounters a missing Hall store
    Given the repository has no .stats directory or Hall database
    When a Hall-backed READ-class handler runs
    Then it creates no directory, database, schema, view, index, or seed row
    And it reports missing or degraded context without mutating the repository

  Scenario: A READ handler opens an existing Hall store
    Given an existing Hall database and a synthetic legacy state projection
    When Hall-backed READ-class handlers run
    Then the database is opened read-only
    And no DDL, seed, migration, or repository file mutation occurs

  Scenario: Hall store path identity is unsafe
    Given the root, .stats directory, or Hall store is linked, replaced, foreign-owned, or writable by other users
    When a caller requests a read-only or writable Hall handle
    Then CStar rejects the path before SQLite opens it
    And no linked target is read or mutated

  Scenario: A caller uses the ambiguous writable facade
    When a caller invokes getDb
    Then it returns legacy_hall_writable_facade_retired_use_explicit_kernel_controller
    And it creates no directory database schema or seed row

  Scenario: A direct Hall utility is invoked
    When a caller runs a legacy schema analytics migration ingestion review or seed script
    Then it returns legacy_direct_hall_script_retired_use_cstar_kernel
    And it performs no filesystem Hall schema lifecycle or host-memory effect

  Scenario: A bead reaches a terminal state
    Given a writable Hall store authorized for bead mutation
    When the bead is blocked or resolved
    Then only the Hall bead lifecycle record is updated
    And no blackboard, presence, mounted-spoke, coordination-event, or legacy state write is implied
