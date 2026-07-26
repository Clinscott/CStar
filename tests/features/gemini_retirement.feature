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

  Rule: Retired activation cannot enter through repository launch surfaces

    Scenario: Core MCP and bootstrap ingress exposes no Gemini activation
      Given the core MCP, terminal, and environment bootstrap surfaces
      When their environment configuration is inspected
      Then none of those bounded surfaces may inject a Gemini CLI activation flag
      And bootstrap must scrub retired flags from an existing environment file
      And legacy Gemini capability markers must not activate sub-agent delegation

  Rule: Active web discovery has one provider route

    Scenario: Search fallback and lexicon discovery use Brave only
      Given local skill discovery needs an external web result
      When CStar invokes its active search provider
      Then only Brave Search may receive the query
      And missing Brave credentials must return no result
      And no retired-provider fallback may run

  Rule: Retired model diagnostics cannot return

    Scenario: Standalone Gemini diagnostics and the Node SDK are absent
      Given Gemini model and ADC probes are retired
      When CStar dependencies and diagnostic scripts are inspected
      Then no standalone Gemini model diagnostic may exist
      And the direct Node Gemini SDK must not be installed

  Rule: Odin game-master behavior remains local and deterministic

    Scenario: Retired provider markers cannot alter an Odin campaign
      Given the Odin game master delegates to the local Sovereign Scenario Engine
      When a fixed thousand-case campaign corpus is generated
      Then its canonical digest must match the pre-retirement baseline
      And Google or Gemini environment markers must not change that digest
      And no remote model client may be constructed
