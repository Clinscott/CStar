Feature: CStar Reliability Loop v1

  Scenario: compatibility opt-in preserves legacy result calls
    Given a legacy result call without reliability metadata or a receipt
    When CoS records an authoritative routine validation
    Then CStar returns the legacy result shape plus no reliability continuation
    And no hidden write or dispatch occurs

  Scenario: routine validation does not run SPRT
    Given a routine bead and an independent authoritative positive validation
    When CoS records the result without a reliability receipt
    Then CStar returns an accepted reliability continuation
    And no repair bead is created by the kernel

  Scenario: elevated validation stays bounded
    Given an elevated source target and a compatible focused checker
    When CoS records a result without a critical reliability receipt
    Then CStar reports a bounded continuation state
    And it does not infer provider spend or hidden dispatch

  Scenario: critical validation requires a bound runner receipt
    Given a critical target and an independent positive validation
    When CoS records the result without a manifest-bound runner receipt
    Then CStar stores inconclusive rather than promoting the result
    And the continuation is repairing only when durable auto-repair is true

  Scenario: critical acceptance requires an exact verified receipt
    Given a critical target and a hash-bound cstar.workflow_sprt_autoresearcher.v1 receipt
    When the receipt is valid, manifest-bound, and independently recorded as ACCEPTED
    Then CStar returns accepted
    And the receipt path, hash, trials, and Gungnir evidence are bounded

  Scenario: malformed or unbound receipts fail closed
    Given a receipt that is missing, malformed, wrong-hash, path-traversing, aliased, duplicate, or unbound
    When CoS records the result
    Then CStar does not promote the validation
    And the failure remains a bounded continuation reason

  Scenario: rejection becomes a bounded repair continuation
    Given an independent rejected validation and durable auto-repair metadata
    When CoS records the result
    Then CStar returns one deterministic idempotent repair bead draft
    And CoS materializes and assigns that draft outside the kernel

  Scenario: Gungnir remains heuristic evidence
    Given a runner receipt with a Gungnir score and a rejected SPRT verdict
    When CoS records the result
    Then the result is not accepted because Gungnir cannot override validation

  Scenario: inconclusive SPRT keeps bounded work active
    Given an authoritative verified receipt with INCONCLUSIVE SPRT and remaining trials
    When CoS records the result
    Then CStar returns working and names only the remaining bounded trials

  Scenario: repair drafts are deterministic and idempotent
    Given an independent rejected validation and durable auto-repair metadata
    When CoS records the same validation id and failure fingerprint twice
    Then CStar returns the same repair bead draft and idempotency key
    And CoS materializes and assigns that draft outside the kernel

  Scenario: protected and external work remains an operator gate
    Given a rejection with durable operator, protected, or external gate metadata
    When CoS records the result
    Then CStar returns operator_decision_required
    And it does not create, claim, dispatch, retry, or spend
