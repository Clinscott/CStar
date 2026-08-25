Feature: A blocked host goal can continue without falsifying host state
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
