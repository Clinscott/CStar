Feature: Validation evidence fails closed
  Detached validation helpers must not turn an absence of failures into proof,
  and CStar must derive verified authority from exact execution lineage.

  Scenario: Passing check without independent evidence
    Given a detached validation result has one passing check
    And it has no independent evidence digest or validator identity
    When the validation verdict is constructed
    Then the verdict is INCONCLUSIVE
    And it is not ACCEPTED

  Scenario: Accepted SPRT with a zero denominator
    Given a detached validation result reports an accepted SPRT verdict
    And the SPRT total is zero
    When the validation verdict is constructed
    Then the verdict is INCONCLUSIVE
    And the zero sample denominator is recorded as an evidence gap

  Scenario: A caller claims validator identity or independence
    Given a cstar_record_result request contains caller-supplied identity or independence fields
    When the strict tool schema validates the request
    Then the request is rejected
    And no verified validation receipt is persisted

  Scenario: The validator shares the requester or executor root thread
    Given hash-verified evidence for an exact Forge execution receipt
    When CStar derives the current validator request identity
    And its root thread matches the Forge requester or authorizing executor
    Then validation fails closed as not independent
    And the Forge attempt remains unfinalized

  Scenario: Evidence is replayed across Forge executions
    Given a verified-v2 manifest bound to execution receipt A
    When it is offered to finalize execution receipt B
    Then CStar rejects the subject and lineage mismatch
    And neither execution changes state

  Scenario: A validator subagent reports host-workflow evidence through its parent CoS
    Given a depth-one validator subagent has one latest completed final turn
    And its independent-validation manifest binds the exact bead, validation id, verdict, artifacts, and checks
    When the canonical root CoS records that manifest and validator receipt
    Then CStar verifies the subagent session lineage and final manifest digest
    And it persists a verified-v3 receipt without granting the subagent mutation authority

  Scenario: Host validation spoofs or drifts its lineage or subject
    Given a host-validation receipt has a different parent, nested agent path, stale completion, failed check, or changed scope
    When the canonical root CoS offers it to cstar_record_result
    Then CStar rejects the exact mismatch before persistence
    And no verified-v3 receipt is minted

  Scenario: Host completion omits only a trailing memory citation projection
    Given a validator final binds the exact manifest digest and validation id
    And the task-complete event carries the exact final body before one complete trailing oai-mem-citation block
    When the canonical root CoS records the host-validation receipt
    Then CStar accepts the receipt without weakening the manifest or validator binding
    But any arbitrary or malformed trailing suffix remains an exact mismatch

  Scenario: Host validation runs with separated code and control roots
    Given the active source and validator evidence live in the canonical code root
    And Hall beads and validation rows live in the separate control root
    When the root CoS records and resolves verified-v3 host evidence
    Then CStar hashes evidence only from the code root
    And it persists lifecycle state only through the control root

  Scenario: Host validation resolves a kernel-anchored trusted spoke
    Given a Hall bead is anchored to exactly one active trusted registered spoke
    And the Hall mount token exactly matches the canonical spoke identity
    When the root CoS records verified-v3 evidence for that bead
    Then CStar hashes the manifest, artifacts, and checks only inside the canonical spoke root
    And it persists validation and Forge lifecycle state only through the control root
    But read_only does not block validation evidence reads

  Scenario: Host validation rejects an unsafe or ambiguous spoke anchor
    Given a bead anchor is missing, ambiguous, unregistered, inactive, untrusted, token-mismatched, symlinked, or root-mismatched
    When the root CoS offers validation evidence for that bead
    Then CStar rejects the spoke root before evidence hashing or Hall persistence
    And caller metadata cannot replace kernel-stamped spoke anchor fields

  Scenario: A persisted spoke anchor must remain exact and current
    Given a spoke bead omits its anchor schema or carries a stale write-policy stamp
    When CStar resolves validation or Sterling evidence roots
    Then CStar rejects the persisted anchor before reading evidence
    And every later bead action preserves the original kernel-stamped anchor fields

  Scenario: Host and Forge validation subjects are mutually exclusive
    Given a result request supplies both a host-validation receipt and a Forge execution receipt
    When the root CoS offers the result to cstar_record_result
    Then CStar rejects the ambiguous subject before Hall lookup or persistence
    And Forge v2 validation persistence and finalization remain one transaction
