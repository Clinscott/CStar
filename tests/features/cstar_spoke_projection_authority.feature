Feature: CStar spoke projection is contained by exact authority
  A Hall-mounted path is a reference and cannot itself authorize filesystem,
  Git, credential, or Hall mutation effects.

  Scenario: A caller requests a retired spoke mutation
    When the caller asks to link, unlink, project, or destructively prune a spoke
    Then the kernel returns the request-scoped operator-attestation error
    And it does not inspect the supplied root, remote, Git repository, or private home

  Scenario: A caller lists or inspects mounted spokes
    When the kernel reads the mounted-spoke Hall rows
    Then it returns lifecycle fields and SHA-256 bindings only
    And it omits raw roots, repository identifiers, remotes, branches, metadata, and tokens

  Scenario: A caller previews prune targets
    Given dry_run is explicitly true and artifact cleanup is false
    When the kernel compares the targets with Hall rows
    Then it reports only exact row and root matches
    And no Hall row or spoke artifact is changed

  Scenario: A spoke read lacks an exact mount binding
    Given the Hall token and bounded identity token do not exactly match
    When capability, journal, health, verify, or bead-import logic resolves the spoke
    Then the read or import fails closed
    And the token and absolute root are not returned

  Scenario: A mounted file is linked or outside the canonical root
    When a skill, journal, lore, design, or identity path is resolved
    Then the symlink or hardlink is rejected without reading outside
    And only safe relative paths may be persisted
