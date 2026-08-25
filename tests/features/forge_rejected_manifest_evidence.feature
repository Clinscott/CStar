Feature: Forge rejected manifest evidence
  Invalid worker output must remain diagnosable without becoming delivery or
  leaking model-provided values.

  Scenario: A worker manifest omits its status
    Given Hermes returned a JSON object for a bounded Forge attempt
    And the object omitted the required status field
    When the Forge worker validates the manifest
    Then the attempt fails before any project-file write
    And a private receipt-local rejected response is retained
    And the response contains a stable failure class and manifest hash
    And the response contains no raw manifest values

  Scenario: A rejected manifest contains canary values
    Given every model-provided field contains a unique synthetic canary
    When the Forge worker rejects the manifest
    Then no canary appears in stdout, the execution trace, or the response artifact
    And the response artifact reports zero changed files
    And independent validation cannot treat the artifact as successful delivery
