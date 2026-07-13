Feature: Forge worker required output path contract
  A write-capable Forge worker must know the exact output set before producing
  its manifest while the adapter continues to enforce that set after delivery.

  Scenario: Required paths are explicit in the sealed worker prompt
    Given a CStar Forge request names a nonempty exact required output set
    When the worker manifest contract is constructed
    Then every project-relative required path appears once in one canonical JSON array
    And the array carries its count and SHA-256
    And no absolute project root appears in the worker prompt
    And the worker is told to return one entry per required path and no other path

  Scenario: A model reports a near-match path
    Given one file path is authorized and required
    And the model reports a path formed by adding a suffix to that file
    When the Forge adapter validates the worker manifest
    Then the manifest is rejected as an undeclared output
    And neither the required path nor the near-match path is written
    And model-provided canary values are absent from retained evidence

  Scenario: A required path contains prompt-control characters
    Given an authorized path contains a newline, escape, bidi, or zero-width control
    When the Forge request boundary validates the exact output set
    Then the request is rejected before reservation or model invocation
    And the fixed failure code contains none of the path value

  Scenario: A safe required path contains JSON punctuation
    Given an authorized path contains spaces, commas, or quotation marks
    When the worker manifest contract is constructed
    Then the path remains one escaped JSON string on one prompt line
    And it cannot introduce an additional prompt field or instruction

  Scenario: Two path spellings resolve to one output
    Given exact or lexical-alias required paths resolve to the same file
    When the Forge request boundary validates the exact output set
    Then it rejects the duplicate rather than silently deduplicating authority
