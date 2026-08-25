Feature: CStar work survives interruption and daily toolchain change
  Scenario: A non-trivial bead is anchored to one host goal
    Given no unfinished host goal exists
    When CoS begins a non-trivial CStar bead
    Then CoS creates one outcome-oriented goal and a bounded plan
    And implementation, validation, CStar recording, and closeout remain part of that goal

  Scenario: Explicit operator resume meets a missing host transition
    Given the existing goal is displayed as blocked
    And the operator explicitly resumes the mission
    But the host exposes no blocked-to-active transition
    Then CoS records the lifecycle defect as a repair bead
    And CoS continues the unchanged goal under the explicit resume signal
    And CoS does not replace the goal or falsify its status

  Scenario: A dirty Hermes checkout blocks the daily update window
    Given the daily Hermes update check reports an available update
    And the Hermes checkout contains local changes
    When CoS evaluates the update window
    Then CoS does not run an updater that may auto-stash
    And CoS records a repair item without stashing, resetting, or cleaning

  Scenario: Model identity is not inferred
    Given CoS requests a Luna, Terra, or Sol profile for a bounded worker
    And the host does not report the actual model identity
    Then the receipt records the requested profile
    And actual_model is null with model_source unreported

  Scenario: Routine Node bootstrap is observational and empty
    Given CoS invokes routine Node runtime bootstrap
    When no separately authorized CStar lifecycle action is requested
    Then bootstrap registers no legacy adapter
    And bootstrap writes no environment value or file
    And bootstrap starts no Hall, state, provider, callback, process, source, checker, or Git activity

  Scenario: Daily freshness preserves lifecycle and runtime gates
    Given the first-task-of-day freshness check is due
    When CoS checks Codex and Hermes versions
    Then the check records bounded version and update evidence only
    And it performs no CStar lifecycle transition
    And update, restart, installation, activation, and Git actions remain separately operator-gated

  Scenario: A successful daily update is not repeated for ordinary upstream drift
    Given today's bounded Codex and Hermes freshness receipt is successful
    When Hermes reports that upstream advanced again later that day
    Then the later drift is informational rather than a red gate
    And CoS does not repeat the update without a failed receipt or explicit operator request

  Scenario: Retired runtime entrypoints cannot resume work
    Given a goal remains blocked and its CStar bead is durable
    When start, Loki resume, estate ritual, or a dynamic legacy command is invoked
    Then the retired entrypoint dispatches no host-governor swarm
    And it does not create or update a Hall bead
    And only an explicit operator resume through the supported CStar boundary may continue work
