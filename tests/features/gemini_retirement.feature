Feature: Gemini retirement

  Rule: Retired repository automation cannot invoke Gemini

    Scenario: GitHub automation exposes no Gemini command or workflow
      Given Gemini CLI is a retired CStar provider
      When the tracked GitHub command and workflow filenames are inspected
      Then no Gemini command template may exist
      And no Gemini workflow may exist
      And no scheduled Gemini triage may run

  Rule: Retired host markers fail closed

    Scenario: Gemini state cannot select or invoke a host
      Given legacy Gemini flags or a Gemini provider override remain in an environment
      When CStar resolves the active host
      Then no host provider may be selected from those values
      And no host executor may be called
      And CStar must return an explicit unsupported-provider error

    Scenario: Supported hosts keep their existing routes
      Given Codex, Claude, or Droid is positively identified
      When CStar resolves the active host
      Then the identified supported provider must be preserved
      And unrelated legacy Gemini markers must not override a Codex session
