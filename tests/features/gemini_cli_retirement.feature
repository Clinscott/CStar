Feature: Gemini CLI retirement

  Rule: Retired repository automation cannot invoke Gemini CLI

    Scenario: GitHub automation exposes no Gemini command or workflow
      Given Gemini CLI is a retired CStar execution surface
      When the tracked GitHub command and workflow filenames are inspected
      Then no Gemini command template may exist
      And no Gemini workflow may exist
      And no scheduled Gemini triage may run

  Rule: Gemini API and bridge support remain separate from the retired CLI

    Scenario: Legacy CLI state cannot select or invoke a host
      Given legacy Gemini CLI flags remain in an environment
      When CStar resolves the active host
      Then no host provider may be selected from those values
      And no host executor may be called
      And CStar must return an explicit inactive-host error

    Scenario: An explicit Gemini bridge remains supported
      Given a Gemini provider override and an explicit host bridge
      When CStar resolves and invokes the active host
      Then the Gemini bridge provider must be selected
      And only the configured bridge command may execute
      And no Gemini CLI executable may be spawned

    Scenario: Supported hosts keep their existing routes
      Given Gemini bridge, Codex, Claude, or Droid is positively identified
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

  Rule: Active web discovery does not depend on Gemini CLI

    Scenario: Search fallback and lexicon discovery use Brave only
      Given local skill discovery needs an external web result
      When CStar invokes its active search provider
      Then only Brave Search may receive the query
      And missing Brave credentials must return no result
      And no retired-provider fallback may run

  Rule: Gemini API and SDK capability is not part of the CLI retirement

    Scenario: Non-CLI Gemini integrations remain eligible for explicit use
      Given a supported Gemini API, SDK, or configured bridge integration
      When the Gemini CLI retirement invariant is evaluated
      Then the non-CLI integration must not be classified as retired
      And its credentials must not be removed merely because they are Gemini credentials
