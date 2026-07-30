Feature: Non-authoritative repository verification evidence

  Scenario: Local verification binds the complete worktree without accepting it
    Given a CStar Git worktree has tracked files, untracked files, and a package lock
    When local repository verification captures its evidence
    Then the receipt binds HEAD and the package-lock hash
    And it contains a byte manifest for every tracked and non-ignored untracked path
    And dirty, deleted, or untracked byte changes alter the source binding
    And it records the exact command list, platform, exit codes, test counts, and output hashes
    And its checksum covers the receipt content
    And the receipt declares authority none
    And it does not record or imply CStar acceptance
    And it does not mutate Hall

  Scenario: Receipt persistence stays within the worktree
    When a verification receipt destination is selected
    Then lexical and symlink escapes are rejected
    And the receipt and latest pointer are replaced atomically
