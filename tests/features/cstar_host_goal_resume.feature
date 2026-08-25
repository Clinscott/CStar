Feature: A blocked host goal can continue without falsifying host state
  Scenario: A stable root instruction binding survives diagnostic prose
    Given a canonical root-user turn names the exact decision and repair and continued beads
    And the turn contains an explicit continuation grant alongside quoted diagnostic questions
    When cstar_goal_resume binds the canonical record set to those exact mission references
    Then the Hall stores one immutable goal resume receipt
    And authorization does not depend on punctuation or an exact prose grammar
    And missing or mismatched mission references fail closed

  Scenario: The operator explicitly resumes while the host has no transition
    Given the host goal is still displayed as blocked
    And the host exposes no supported blocked-to-active transition
    And an in-progress CStar repair bead anchors the lifecycle defect
    When the canonical root-user turn explicitly resumes the goal
    Then cstar_goal_resume appends one cstar.host_goal_resume.v1 decision event
    And the event stores hashes and lifecycle references but no raw operator message
    And the host goal remains blocked
    And the event grants continuity only

  Scenario: Bead lifecycle remains independent of host-goal continuity
    Given cstar_bead owns only bead lifecycle transitions
    When a caller requests record_goal_resume through cstar_bead
    Then the bead schema rejects the unsupported action
    And no Hall mutation occurs

  Scenario: The same resume turn is replayed
    Given one host-goal resume event already binds the exact operator record set and goal hashes
    When the same request is replayed
    Then CStar returns the existing resume id
    And no second coordination event is inserted

  Scenario: Resume language is missing or negated
    Given the root-user turn is hypothetical, revokes permission, or says not to resume
    When CoS requests a host-goal resume record
    Then CStar fails closed with a stable goal_resume operator-signal error
    And no coordination event is inserted

  Scenario: Resume language is quoted or incidental documentation prose
    Given a root-user turn only discusses a resume button, question, quotation, or example
    When CoS requests a host-goal resume record
    Then CStar rejects the text as a missing explicit resume signal
    And no coordination event is inserted

  Scenario: Repair-and-proceed language resumes continuity without granting Forge authority
    Given an unchanged goal owns a Forge request with a proven pre-provider mechanical failure
    When the operator says the error should be fixed and the build proceed
    Then cstar_goal_resume records continuity only
    And no Forge request, authorization, attempt, provider action, or spend is created by goal resume
    And the original Forge authorization remains the sole authority for an independently validated continuation
