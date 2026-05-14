Feature: War-Game Scoring — Kernel-Side Arbitration of Attacker-vs-Defender Contests
  As the CStar kernel, the impartial arbiter between attacker and defender systems
  I want to derive scores from the join of attacker shot-fired Engrams and defender
  verdict Engrams without trusting either side's self-report
  So that contests like USB Forge vs USB Sentry produce a tally neither combatant
  can corrupt by mis-reporting its own outcome.

  Background:
    Given the Hall schema includes the war_game_contests and war_game_scores tables
    And cstar_record_result invokes the scoring trigger after persisting an Engram
    And the kernel has registered the contest "usb-forge-vs-sentry-v1"

  # ─── Q1: Synchronous scoring on defender's verdict write ─────────────

  Scenario: Verdict Engram triggers a score insert in the same transaction
    Given an attacker shot-fired Engram for shot_id "01HSP-A" has been recorded
    When a defender verdict Engram for shot_id "01HSP-A" with terminal_event "usb-sentry/complete" is recorded
    Then a row in war_game_scores exists for shot_id "01HSP-A"
    And a cstar/war-game/scored/01HSP-A Engram is recorded in the same transaction
    And the score is observable within the same cstar_record_result call

  # ─── Q2: Contest registration is the basis for matching ──────────────

  Scenario: Verdict Engram outside any registered prefix is not scored
    Given no registered contest has defender_intent_prefix matching "unrelated-system/event/"
    When an Engram with intent "unrelated-system/event/foo" is recorded
    Then no row is inserted into war_game_scores
    And no cstar/war-game/scored/* Engram is emitted

  Scenario: Verdict Engram matches multiple contests if multiple prefixes apply
    Given two contests are registered with overlapping defender_intent_prefix
    When a verdict Engram matching both prefixes is recorded
    Then one war_game_scores row is inserted per matching contest

  # ─── Q3: Outcome enumeration — each case produces exactly one outcome ─

  Scenario: Expected Deflected + terminal_event in block class → defender_blocked
    Given attacker shot-fired declares expected.outcome "deflected"
    And defender verdict terminal_event is "usb-sentry/phase1-hit"
    When scoring runs
    Then the score outcome is "defender_blocked"

  Scenario: Expected Deflected + terminal_event "usb-sentry/complete" → attacker_bypassed
    Given attacker shot-fired declares expected.outcome "deflected"
    And defender verdict terminal_event is "usb-sentry/complete"
    When scoring runs
    Then the score outcome is "attacker_bypassed"

  Scenario: Expected CapturedClean + terminal_event "usb-sentry/complete" → baseline_pass
    Given attacker shot-fired declares expected.outcome "captured_clean"
    And defender verdict terminal_event is "usb-sentry/complete"
    When scoring runs
    Then the score outcome is "baseline_pass"
    And no point is awarded to either side in the tally

  Scenario: Expected CapturedClean + terminal_event in block class → false_positive
    Given attacker shot-fired declares expected.outcome "captured_clean"
    And defender verdict terminal_event is "usb-sentry/phase1-hit"
    When scoring runs
    Then the score outcome is "false_positive"
    And the tally awards a point to the attacker (Sentry blocked a benign device)

  Scenario: Terminal event is a listener-internal failure → inconclusive
    Given defender verdict terminal_event is "usb-sentry/forge-listener-timeout"
    When scoring runs
    Then the score outcome is "inconclusive"
    And inconclusive_reason is "listener_timeout"

  # ─── Q4: Protocol-violation detection ─────────────────────────────────

  Scenario: terminal_event structurally impossible for the scenario_id → protocol_violation
    Given the contest's scenario_compatibility_map for "FORGE-HID-001" is ["usb-sentry/device-held-rejected"]
    And a defender verdict for shot_id (scenario_id "FORGE-HID-001") reports terminal_event "usb-sentry/complete"
    When scoring runs
    Then the score outcome is "protocol_violation"
    And no point is awarded
    And the score row is flagged for operator audit

  # ─── Q5: Score deduplication ──────────────────────────────────────────

  Scenario: Second verdict Engram for the same shot_id does not double-count
    Given a score row exists for shot_id "01HSP-B" with outcome "defender_blocked"
    When a second verdict Engram for shot_id "01HSP-B" with the same terminal_event is recorded
    Then the war_game_scores row count for that shot_id remains 1
    And the existing row is unchanged

  Scenario: Second verdict with a more-severe outcome upgrades the score
    Given a score row exists for shot_id "01HSP-C" with outcome "defender_blocked"
    When a second verdict Engram for shot_id "01HSP-C" arrives with terminal_event implying "attacker_bypassed"
    Then the war_game_scores row for that shot_id has outcome "attacker_bypassed"
    And the upgrade is logged

  Scenario: Second verdict with a less-severe outcome does not downgrade the score
    Given a score row exists for shot_id "01HSP-D" with outcome "attacker_bypassed"
    When a second verdict Engram for shot_id "01HSP-D" implies "defender_blocked"
    Then the war_game_scores row for that shot_id retains outcome "attacker_bypassed"

  # ─── Q6: Query surface — cstar_war_game_score MCP tool ────────────────

  Scenario: Tally returns the running totals per contest
    Given 5 defender_blocked, 2 attacker_bypassed, 1 false_positive, 3 baseline_pass score rows exist for contest "usb-forge-vs-sentry-v1"
    When cstar_war_game_score is invoked with action "tally"
    Then the response includes counts: defender_blocked=5, attacker_bypassed=2, false_positive=1, baseline_pass=3
    And the defender score is 5
    And the attacker score is 3 (attacker_bypassed + false_positive)
    And the response includes total_shots=11

  Scenario: by_scenario returns per-scenario outcome breakdowns
    When cstar_war_game_score is invoked with action "by_scenario" and contest "usb-forge-vs-sentry-v1"
    Then the response groups scores by scenario_id
    And each group reports counts of every outcome variant

  Scenario: get_score returns a single shot's score row
    Given a score row exists for shot_id "01HSP-E"
    When cstar_war_game_score is invoked with action "get_score" and shot_id "01HSP-E"
    Then the response is the score row including outcome, scenario_id, and timestamps

  # ─── §5: Trigger is fail-soft — never blocks the Hall write ───────────

  Scenario: A scoring failure does not block the underlying Engram write
    Given the war_game_contests table is locked or otherwise unavailable
    When a defender verdict Engram is recorded
    Then the Engram itself lands in the Hall
    And no war_game_scores row is inserted for that shot
    And a warning is logged

  # ─── §4: Trigger runs only after the Engram is persisted ──────────────

  Scenario: Score trigger sees the Engram as persisted
    Given the scoring trigger is observed by an instrumentation hook
    When a verdict Engram is recorded
    Then the inbound Engram is already queryable in the Hall before scoring runs
    And the cstar/war-game/scored/* Engram lands after both

  # ─── CLI surface ──────────────────────────────────────────────────────

  Scenario: ./cstar war-game tally prints the running scoreboard
    When the operator runs "./cstar war-game tally"
    Then stdout contains a header row "CONTEST" "DEFENDER" "ATTACKER" "INCONCLUSIVE"
    And each registered contest is listed with its current totals
    And the exit code is 0

  Scenario: ./cstar war-game recent N lists the last N scored events
    When the operator runs "./cstar war-game recent 5"
    Then stdout lists 5 most-recent scored shots in reverse-chronological order
    And each line includes shot_id, scenario_id, outcome, scored_at

  # ─── No-regression on the Hall write path ────────────────────────────

  Scenario: Engrams matching no contest are recorded identically to pre-bead behaviour
    Given the war_game_contests table is empty
    When an Engram with arbitrary intent is recorded
    Then the cstar_record_result behaviour is byte-identical to the pre-bead version
    And no war_game_scores rows exist
