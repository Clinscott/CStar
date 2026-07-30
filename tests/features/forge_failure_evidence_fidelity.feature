Feature: Conservative Forge failure evidence
  CStar must derive provider spend from bounded journal receipts rather than
  trusting worker-controlled status booleans or process identifiers.

  Scenario: Known spend is followed by an ambiguous provider request
    Given three provider requests completed with bounded role and token receipts
    And the fourth request reached dispatch without a complete response body
    When CStar projects the terminal Forge evidence
    Then known spend remains observed
    And live spend is unknown
    And the first three role receipts and token totals remain available

  Scenario: Worker booleans contradict completed provider evidence
    Given a completed provider receipt and a worker no-spend claim
    When CStar projects the terminal Forge evidence
    Then the no-spend claim cannot mask known spend
    And live spend is unknown

  Scenario: Adapter launch fails before a child can exist
    Given the contained spawn reports ENOENT or E2BIG
    When CStar projects the terminal Forge evidence
    Then no spend is proven without using a process identifier

  Scenario: Provider output contains unbounded diagnostic material
    Given a receipt contains arbitrary stdout, stderr, headers, body, or path data
    When CStar projects the terminal Forge evidence
    Then the malformed receipt fails closed
    And no arbitrary provider material is persisted

  Scenario: Worker artifact evidence is adversarially deep or wide
    Given artifact evidence exceeds depth node or combined path-claim limits
    Or files_changed or an explicit artifact path claim is blank padded or missing
    When CStar validates the private response before filesystem probes
    Then validation fails with one exact sanitized machine code
    And no recursive traversal unbounded path probe or raw response publication occurs

  Scenario: A Forge delivery reports success
    Given all six ordered provider requests completed
    And all six role receipts, token totals, and journal receipts are valid
    And no provider request is ambiguous
    When CStar validates the success evidence
    Then the success evidence is accepted
