Feature: Canonical Gungnir score scale

  Rule: Matrix producers emit only canonical score projections

    Scenario: A matrix receives explicit projection input
      Given a projection is absent, null, or non-finite
      When the matrix is constructed
      Then the projection must be derived deterministically from canonical axes
      And an explicit score outside zero to ten must be rejected
      But non-negative gravity, coupling, and anomaly metrics may exceed ten

  Rule: Score-bearing consumers use one zero-to-ten scale

    Scenario: Drift Audit scores a supported source file
      Given Universal Gungnir returns a canonical matrix
      When Drift Audit records the file
      Then it must use the matrix overall score
      And it must not invent a separate zero-to-one-hundred score

    Scenario: Sterling evaluates audit authority
      Given caller evidence includes a scalar Gungnir score
      When Sterling evaluates the audit leg
      Then both zero-to-ten and legacy-scale scalar claims must be rejected
      And only an authoritative independent validation receipt may satisfy audit
