Feature: AutoBot Skill
  Scenario: AutoBot is an ephemeral bead worker
    Given an actionable sovereign bead exists in the Hall of Records
    When autobot executes the bead
    Then Hermes must be launched from AutoBot as a disposable worker
    And the orchestrator must terminate Hermes after the attempt completes

  Scenario: Resolution is checker-gated
    Given AutoBot has produced a candidate for a claimed bead
    When the external checker rejects the candidate
    Then autobot must retry with the validation feedback while budget remains
    And it must block the bead honestly when the retry budget is exhausted

  Scenario: AutoBot respects bounded handoff context
    Given chant has supplied a compressed Hall and PennyOne brief
    When autobot executes the bead
    Then autobot must treat that brief as the authoritative non-local context budget
    And it must keep its inspection local to the active target unless the bead requires more
