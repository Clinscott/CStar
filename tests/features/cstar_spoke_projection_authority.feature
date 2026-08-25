Feature: CStar compatibility-first spoke attachment authority
  Hall owns the attachment projection. The spoke repository remains untouched,
  filesystem-reading consumers use the same Hall-first authority verifier, and
  Doctor remains a Hall-only projection.

  Scenario: The legacy cstar_spoke mutation actions remain retired
    When the caller asks cstar_spoke to link, unlink, or project a spoke
    Then the kernel returns the stable retired-mutation error
    And it does not inspect the supplied root, remote, Git repository, or private home

  Scenario: A supported attachment link is Hall-owned and import-ready
    Given a synthetic canonical repository root under Corvus
    When cstar_spoke_attachment links the exact lowercase basename slug
    Then Hall records one immutable grant and link-authority receipt
    And the mounted row is active trusted local read_write with missing projection
    And no token or .cstar/IDENTITY.json is written

  Scenario: Hall attachment authority can replace an absent legacy token
    Given an active Hall attachment has no spoke identity file
    When a consumer verifies the mounted spoke
    Then authority_verification is hall_attachment_verified
    And the retained mount_token verdict is unproven

  Scenario: Doctor remains Hall-only
    Given a mounted row names a root that must not be probed
    When Doctor surveys the Hall row
    Then attachment authority observation is unobserved and verification is not_checked
    And filesystem_observation is not_performed
    And Doctor does not invoke root, policy, Git-marker, receipt, or identity verification

  Scenario: An explicit identity contradiction cannot be masked by Hall
    Given an active Hall attachment has a malformed or mismatched identity file
    When a consumer verifies the mounted spoke
    Then verification fails with an identity or token failure code

  Scenario: Public projections redact authority material
    When list, inspect, status, health, verify, journal, capability, or bead-import reads a spoke
    Then it exposes authority_verification and a safe failure code when present
    And it omits raw roots, tokens, receipt ids, metadata, and operator text

  Scenario: Project is Hall-only and project and unlink are current-turn-only
    Given an active attachment exists
    When project is requested without an authority_source and with an exact current-root-turn grant
    Then it consumes that grant and may update only Hall projection state
    And its projection receipt binds the active link receipt as parent
    And when unlink is requested it consumes another current-root-turn grant before revoking the link and deleting the exact row

  Scenario: Policy and root-object replacement fail closed
    Given Hall linked a root with the exact nearest AGENTS bytes and root identity
    When those policy bytes change or the root object is replaced at the same path
    Then verification reports the exact policy-drift or root-moved failure

  Scenario: Durable evidence is redacted and event-shaped
    When Hall consumes an attachment grant
    Then its grant and receipt bind root and policy hashes without storing the raw root
    And one grant has one receipt, one link has at most one revocation, and projection binds its link parent

  Scenario: A mounted file is read only inside the canonical root
    When a skill, journal, lore, design, or identity path is resolved
    Then the symlink or hardlink is rejected without reading outside
    And only safe relative paths may be persisted
