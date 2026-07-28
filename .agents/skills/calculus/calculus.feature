Feature: Gungnir Calculus kernel primitive

  Rule: Scoring is canonical and deterministic

    Scenario: Score a supported workspace file
      Given a supported source file inside the selected workspace
      When Gungnir Calculus scores the file
      Then it returns the canonical zero-to-ten Gungnir matrix
      And it labels the current analysis coverage as heuristic
      And repeated scoring of unchanged bytes returns the same result
      And the result does not contain metrics_delta

  Rule: Auditing reports evidence without mutation

    Scenario: Audit a file containing a known breach
      Given a supported source file containing a Gungnir rule breach
      When Gungnir Calculus audits the file
      Then it returns the deterministic ordered breach set
      And no source, Hall, StateRegistry, or .stats state changes

  Rule: Invalid requests fail closed

    Scenario: Reject an unsafe target
      Given the target is missing, outside the selected workspace, a directory, or unsupported
      When Gungnir Calculus validates the request
      Then it fails with an explicit error
      And it does not claim a score or successful audit
