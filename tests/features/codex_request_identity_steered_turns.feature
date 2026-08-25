Feature: Codex steered-turn request identity
  CStar must accept legitimate root-user steering within one Codex turn while
  binding operator consent and Forge spend to the complete ordered root-user
  projection.

  Scenario: Distinct root-user steering records form one canonical turn cohort
    Given a canonical root-user Codex session has distinct user messages sharing one turn id
    And assistant, tool, or event records may appear between those user messages
    When CStar recovers the selected latest turn identity
    Then it binds every matching root-user message in physical JSONL order
    And interleaved non-user records do not join the cohort
    And the terminal raw-record SHA-256 remains the compatibility record hash

  Scenario: The ordered set digest binds every steering record
    Given a selected turn contains one or more distinct canonical root-user records
    When CStar constructs the turn record-set identity
    Then it hashes the domain cstar.codex_root_user_turn_record_set.v1
    And it binds the thread id, turn id, physical index, timestamp, and raw-record SHA-256
    And it reports the exact matching record count
    And it never sorts, normalizes, or deduplicates the records

  Scenario: Consent is one exact reference-hashed record in its cohort
    Given benign steering messages may precede or follow the consent in one authorization turn
    And exactly one user record matches the authorization reference message hash
    When CStar verifies the operator grant
    Then the matching raw-record hash must belong to the canonical authorization cohort
    And no other steering text is concatenated into the consent
    But the matching consent record need not be terminal or latest

  Scenario: A historical authorization is independent from the current request
    Given a contiguous authorization cohort precedes a later benign root-user turn in the same thread
    When the later turn makes a Forge request using that authorization reference
    Then the current request identity must be the latest canonical root-user cohort
    And the authorization remains bound to its separate historical cohort

  Scenario: Later revocation or conflicting instructions invalidate consent
    Given an exact reference-hashed authorization record has been recovered
    And a later user record revokes, stops, or contradicts the authorized Forge lane
    When CStar verifies the operator grant
    Then authorization fails closed as a later revocation or conflict

  Scenario: A later user record must remain inspectable for revocation
    Given an exact reference-hashed authorization record has been recovered
    And a later root-user record has malformed, blank, or non-input-text content
    When CStar verifies the older operator grant
    Then authorization fails closed as an uninspectable later user record
    And the record cannot conceal a revocation or conflicting instruction

  Scenario: An authorization turn reappears after another user turn
    Given authorization turn A is followed by root-user turn B and then turn A appears again
    When CStar recovers the authorization cohort
    Then it rejects the A-B-A reuse as noncontiguous
    And no operator authorization is accepted

  Scenario: The session cannot supply one safe fixed snapshot
    Given a Codex session violates snapshot immutability, file safety, JSONL shape, size, or final-line completeness
    When CStar recovers Codex request identity
    Then request identity fails closed with a stable failure class
    And no operator authorization is accepted

  Scenario: A long-lived session uses a bounded authority projection
    Given a safe fixed Codex session contains large assistant, reasoning, tool, or event payloads
    When CStar scans the session for request identity and later authorization conflicts
    Then it hashes the complete fixed file and validates every UTF-8 JSONL row
    And it feeds only the current record into bounded selected-turn and revocation state machines
    And it retains no raw authority-row list
    And physical bytes, individual records, total rows, and selected-turn state remain independently capped
    And later revocation detection and ordered raw user-record hashes remain unchanged

  Scenario: Current request and historical authorization share one fixed scan
    Given one direct-stdio authorization check carries current Codex request metadata
    When CStar derives the latest request cohort and historical consent state
    Then it opens and scans the session file exactly once
    And no appended steering turn can race two identity snapshots

  Scenario: Selected cohort record integrity is invalid
    Given a selected record violates uniqueness, completeness, recency, or timestamp ordering
    When CStar recovers Codex request identity
    Then request identity fails closed with a stable failure class
    And no partial cohort is accepted

  Scenario: Selected cohort topology or lineage is invalid
    Given the current request cohort is noncontiguous, not latest, or carries parent, fork, or subagent lineage
    When CStar recovers Codex request identity
    Then request identity fails closed with a stable failure class
    And the cohort grants no operator authority

  Scenario: A selected turn id appears as correlation metadata on a non-user record
    Given an assistant, reasoning, tool-call, tool-output, or event record carries the selected turn id
    When CStar recovers Codex request identity
    Then the record is excluded from authority, hashes, counts, timestamps, and cohort topology
    And inserting or mutating that record cannot change the root-user record-set digest

  Scenario: A tagged record explicitly claims user authority without the canonical wrapper
    Given a selected or later tagged record claims user role or user-message type
    But it is not a canonical response-item message with user role
    When CStar recovers request identity or checks later authorization conflicts
    Then it fails closed as noncanonical or uninspectable user evidence
    But an untagged host event duplicate remains non-authoritative and ignored

  Scenario: Forge execute detects post-request authorization drift before spend
    Given an authorized Forge request durably stores the exact authorization-row raw hash
    And it durably stores the authorization cohort's ordered record-set digest and exact record count
    When any stored authorization identity value differs on execute-time recovery
    Then Forge rejects forge_operator_authorization_attestation_drift
    And it does so before attempt reservation, adapter invocation, or model spend

  Scenario: Local attestation retains a same-UID trust boundary
    Given a process with the same OS user can access the Codex session store
    When CStar verifies direct-stdio operator attestation
    Then the evidence binds the request within the trusted single-user host
    But it is not a cryptographic boundary against a hostile same-UID process
