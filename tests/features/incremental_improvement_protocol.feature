Feature: Incremental repository improvement

  Scenario: A candidate is tested as one bounded hypothesis
    Given a named review branch and a Hall Bead with acceptance criteria
    And the baseline commit, commands, fixtures, environment, and results are recorded
    When one coherent candidate change is implemented
    Then the same focused checks and matched benchmark must run against the candidate
    And unrelated findings must become separate Beads
    And the candidate must be retained, revised, or reverted from the comparison evidence

  Scenario: Retained work becomes durable before another change begins
    Given a candidate has passed its declared verification
    When the candidate is retained
    Then its commit must be pushed to the review branch
    And the remote branch ref must be read back and match the intended commit
    But if publication is blocked
    Then further changes must stop until a verified recovery checkpoint exists

  Scenario: Review branches do not bypass release gates
    Given a retained candidate is durable on a draft pull request
    When a merge or activation is considered
    Then operator and repository review gates must still apply
    And the CStar v2 control plane must not merge before its deferred CorvusEye gate
