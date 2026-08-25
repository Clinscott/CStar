Feature: A blocked host goal can continue without falsifying host state

  Scenario: The v2 caller supplies request identity and a structured host projection
    Given a pending v3 Forge request owns the repair bead, decision, and immutable root-repair sidecar
    And the caller supplies only forge_request_receipt_id, request_sha256, and host_goal_projection
    And host_goal_projection uses schema cstar.host_get_goal_projection.v1
    When cstar_goal_resume validates the request and projection
    Then the kernel derives the request bead, decision, and sidecar from the persisted request
    And caller-supplied bead, decision, scope, or sidecar fields are not accepted
    And request identity, request hash, host thread, and root thread remain bound

  Scenario: The canonical v2 snapshot is persisted without raw host or operator text
    Given the host projection contains the exact objective, blocked status, counters, timestamps, and unavailable resume capability
    When cstar_goal_resume records the continuity event
    Then the receipt schema is cstar.host_goal_resume.v2
    And the canonical persisted material uses schema cstar.host_goal_snapshot.v1
    And its fixed fields are schema, host_goal_thread_id, host_goal_objective_sha256, host_goal_status, host_goal_created_at, host_goal_updated_at, and host_resume_capability
    And the objective hash covers the exact UTF-8 bytes without trim or Unicode normalization
    And raw objective text, raw operator text, tokensUsed, and timeUsedSeconds are absent from the receipt and event
    And host_goal_status remains blocked and authority_effect is continuity_only

  Scenario: Interruption permits ordinary same-root liveness without fresh grant wording
    Given the root repair request was persisted before an interruption
    And a later current turn is on the same canonical root thread
    And the later turn does not contain revocation, protected action, fork, switch, or scope-expansion wording
    When cstar_goal_resume is called with the unchanged request identity and v2 projection
    Then the continuity event records without a fresh repair grant phrase or old exact challenge
    And no Forge request, authorization, attempt, provider action, or spend is created by goal resume
    And no host transition is created by goal resume

  Scenario: Neutral, status, and question text do not expand continuity authority
    Given a later same-root turn says Inspect the README, asks a status question, or gives unrelated neutral text
    When cstar_goal_resume evaluates current liveness
    Then the turn is treated only as liveness evidence
    And a recorded event remains continuity_only
    And no protected effect or new scope is inherited

  Scenario: Revocation and protected or divergent wording veto continuity
    Given a pending v3 request has an unchanged root repair sidecar
    When the later same-root turn revokes, negates, deploys, expands scope, names a different target, names a different goal, forks, or switches
    Then cstar_goal_resume fails closed with goal_resume_v2_current_liveness_revoked
    And no resume event is inserted

  Scenario: Replay is immutable and does not create Forge state
    Given one v2 resume event already binds the request, snapshot, root thread, and operator record set
    When the same v2 call is replayed
    Then CStar returns the existing resume_id with status replayed
    And exactly one v2 coordination event exists
    And Forge attempt and authorization counts remain zero

  Scenario: Drift and spent state fail closed
    Given a v2 resume request is bound to request, target, scope, package-lock, snapshot, sidecar, and thread hashes
    When any request hash, target, scope, package-lock, snapshot, sidecar, root-thread, authorization, or spent-state value drifts
    Then the stable v2 blocker is returned
    And no new continuity event is inserted

  Scenario: Forge consumes only a trusted v2 receipt
    Given cstar_goal_resume returned a v2 resume_id
    When cstar_forge_authorize receives only forge_request_receipt_id, request_sha256, and goal_resume_id
    Then Forge derives bead, decision, root-repair, and continuity evidence from the trusted request and event
    And authorization succeeds without fresh repair wording
    And a v1 goal_resume_id is rejected with forge_goal_resume_v1_historical_only
    And continuity_only does not inherit source, Git, install, restart, activation, deployment, secrets, spend, scope, or production authority

  Scenario: Bead lifecycle remains independent of host-goal continuity
    Given cstar_bead owns only bead lifecycle transitions
    When a caller requests record_goal_resume through cstar_bead
    Then the bead schema rejects the unsupported action
    And no host-goal resume event is created
