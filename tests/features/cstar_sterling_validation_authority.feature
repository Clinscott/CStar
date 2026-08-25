Feature: Sterling resolution uses exact independent validation authority
  A bead must not close from caller claims, cached metadata, or arbitrary file
  reads. Lore, Isolation, and Audit must be joined by one execution-bound
  verified-v2 receipt.

  Scenario: A bead has complete current evidence
    Given contained Lore and Isolation files with unchanged bytes
    And a positive independent Hall validation-v2 receipt for the exact Forge execution, bead, and repository
    When the caller resolves the bead with that validation id
    Then Sterling recomputes the manifest digest and evidence file hashes
    And the bead may reach RESOLVED

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
