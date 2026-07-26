Feature: Gemini retirement

  Rule: Retired repository automation cannot invoke Gemini

    Scenario: GitHub automation exposes no Gemini command or workflow
      Given Gemini CLI is a retired CStar provider
      When the tracked GitHub command and workflow filenames are inspected
      Then no Gemini command template may exist
      And no Gemini workflow may exist
      And no scheduled Gemini triage may run
