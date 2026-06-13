Feature: Host-side sync worker (mirror export ↓ + intent drain ↑)
  Lore: "The bridge between the cloud mailbox and the authoritative host."
  Standard: Linscott Standard (Atomic Verification)

  As the CStar host operator
  I want a worker that mirrors proposals up to Mongo and applies queued intents down
  So that the cloud console can be operated from a phone while pennyone.db stays authoritative.

  Background:
    Given pennyone.db is the only source of truth
    And the only writer to pennyone.db is scripts/sync_research_proposals.py
    And the worker shells that CLI with argv arrays and never opens pennyone.db for write

  Scenario: Drain a pending intent up through the pipeline CLI
    Given an intent_queue document with status "pending" and action "accept"
    When the worker ticks
    Then the intent is atomically claimed (status "processing", stamped claimed_at)
    And the pipeline CLI is invoked as "accept --id <proposal_id> --notes <notes>"
    And on CLI success the intent becomes "applied" with the CLI JSON result and applied_at

  Scenario: Map an edit intent to the CLI argv
    Given a "pending" edit intent whose payload is { payload: <spec>, notes: <S> }
    When the worker maps the intent
    Then the argv is "edit --id <proposal_id> --payload <JSON.stringify(spec)> --notes <S>"
    And operator-supplied fields are passed as discrete argv elements, never a shell string

  Scenario: A failing intent is isolated and never blocks the others
    Given two "pending" intents where the first makes the CLI exit non-zero
    When the worker drains the queue
    Then the first intent becomes "failed" with the captured stderr and failed_at
    And the second intent is still applied
    And the loop does not crash

  Scenario: An unsupported action is rejected before shelling
    Given a "pending" intent whose action is outside accept/decline/refine/dispatch/edit
    When the worker drains the queue
    Then the intent becomes "failed"
    And the pipeline CLI is never invoked for it

  Scenario: Exactly-once application
    Given an intent already claimed as "processing"
    When the worker drains the queue
    Then it is not claimed again

  Scenario: Export the mirror down after each tick
    When the worker ticks
    Then it runs "list --history"
    And every proposal is upserted into proposal_mirror keyed by proposal_id
    And mirror reads by the console never block on the worker

  Scenario: Reconcile stale mirror documents when enabled
    Given reconcile is enabled
    When the worker exports the mirror
    Then mirror documents whose proposal_id is absent from the latest export are removed

  Scenario: Degrade cleanly without configuration
    Given CSTAR_MONGO_URI is unset
    When the worker starts
    Then it exits cleanly without connecting
    And the connection string is never logged
