Feature: Gungnir Calculus compatibility library

  Rule: Scoring is deterministic evidence

    Scenario: Score a supported workspace file
      Given a supported source file inside the selected workspace
      When Gungnir Calculus scores the file
      Then it returns the canonical Gungnir matrix
      And it labels the analysis coverage as heuristic
      And repeated scoring of unchanged bytes returns the same result
      And the result does not contain metrics_delta

  Rule: Auditing is bounded and read-only

    Scenario: Audit a file containing a known breach
      Given a supported source file containing a Gungnir rule breach
      When Gungnir Calculus audits the file
      Then it returns deterministic ordered breach evidence
      And no source, Hall, StateRegistry, report, or .stats state changes

  Rule: Invalid and implicit activation fail closed

    Scenario: Reject an unsafe target
      Given the target is missing, outside the selected workspace, a directory, or unsupported
      When Gungnir Calculus validates the request
      Then it fails with an explicit error
      And it does not claim a score or successful audit

    Scenario: Keep the operator catalog bounded
      Given calculus is present in the canonical registry
      When the default runtime and command catalog initialize
      Then no calculus adapter or command is registered
      And calculus remains explicit compatibility discovery only
