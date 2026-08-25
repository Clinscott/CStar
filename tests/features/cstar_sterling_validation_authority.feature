Feature: Sterling resolution uses exact independent validation authority
  A bead must not close from caller claims, cached metadata, or arbitrary file
  reads. Lore, Isolation, and Audit must be joined by one kernel-verified Forge
  v2 or host-workflow v3 receipt.

  Scenario: A bead has complete current evidence
    Given contained Lore and Isolation files with unchanged bytes
    And a positive independent Hall validation-v2 receipt for the exact Forge execution, bead, and repository
    When the caller resolves the bead with that validation id
    Then Sterling recomputes the manifest digest and evidence file hashes
    And the bead may reach RESOLVED

  Scenario: Host workflow evidence comes from a depth-one validator
    Given contained Lore and Isolation files with unchanged bytes
    And a positive verified-v3 receipt bound to the exact bead, repository, target, parent CoS, and validator manifest
    When the caller resolves the bead with that validation id
    Then Sterling recomputes the v3 manifest and all current evidence hashes
    And the bead may reach RESOLVED without treating the validator as an operator

  Scenario: A caller supplies an absolute or linked artifact path
    When Sterling evaluates the Lore or Isolation declaration
    Then it rejects the path without reading outside the CStar root
    And no caller-controlled path value is emitted as authority

  Scenario: A caller supplies a score, Warden claim, force reason, or exemption
    When Sterling evaluates the resolution request
    Then the claim grants no Audit authority
    And the bead remains unresolved

  Scenario: A verified receipt is replayed with different content
    Given Hall already stores an authoritative validation id
    When another result attempts to change its scope, identity, verdict, or manifest
    Then Hall rejects the conflicting receipt
    And the original verified receipt remains immutable

  Scenario: A legacy or cross-execution receipt is offered
    Given a validation-v1 receipt or a validation-v2 receipt bound to another Forge execution
    When Sterling evaluates the Audit leg
    Then the receipt grants no Audit authority
    And the bead remains unresolved

  Scenario: A host receipt is replayed after target or validator-manifest drift
    Given a verified-v3 receipt was recorded for the original bead target and manifest bytes
    When the bead target or validator manifest no longer matches
    Then the receipt grants no Audit authority
    And the bead remains unresolved
