Feature: Canonical Gungnir score scale

  Rule: Matrix producers emit only canonical score projections

    Scenario: A matrix receives explicit projection input
      Given a projection is absent or null
      When the matrix is constructed
      Then the projection must be derived from canonical axes
      And an explicit score outside zero to ten must be rejected
      But non-negative gravity, coupling, and anomaly metrics may exceed ten

  Rule: Gungnir evidence uses one zero-to-ten scale

    Scenario: Sterling evaluates a current Gungnir score
      Given a finite Gungnir score between zero and ten
      When Sterling evaluates the audit leg
      Then a score at or above 6.0 may satisfy the floor
      And a score below 6.0 must fail the floor

    Scenario: Invalid or legacy-scale evidence is explicit
      Given a non-finite, negative, greater-than-ten, or legacy-scale score
      When Sterling evaluates the audit leg
      Then the score must be rejected
      And a legacy baseline must require an explicit migration

  Rule: Reports use the canonical scorer

    Scenario: Drift Audit scores a supported source file
      Given Universal Gungnir returns a canonical matrix
      When Drift Audit records the file
      Then it must use the matrix overall score
      And it must not invent a separate zero-to-one-hundred score

    Scenario: GPHS combines Gungnir with percentage metrics
      Given Gungnir has produced a canonical zero-to-ten score
      When the project health percentage is calculated
      Then the Gungnir score must be converted to a percentage exactly once
      And legacy-scale inputs must not be blended as canonical scores
