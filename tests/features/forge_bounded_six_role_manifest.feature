Feature: Bounded six-role Forge manifest orchestration
  CStar must preserve one durable attempt around a fixed, evidence-producing
  producer chain without claiming genuine upstream Git-worktree SwarmForge.

  Scenario: A successful bounded build reaches QA through six sealed roles
    Given one operator-authorized CStar Forge attempt with zero retries
    And exact target and required-output paths
    When the private Hermes MiniMax adapter executes the bounded role plan
    Then the roles run as specifier, coder, cleaner, architect, hardener, and QA
    And each role uses one fresh sealed process and at most one provider request
    And coder receives the accepted specification as its immediate handoff
    And cleaner through QA receive the immutable specification and immediate mutable handoff
    And every provider response binds execution, runtime, role, phase, plan, prior handoff, and specification handoff identities
    And only the final QA handoff may supply the exact-output manifest
    And CStar records ordered receipts, request counts, and per-role token usage
    And the delivery remains unverified until independent CStar validation

  Scenario: A failed role stops the chain without retry
    Given a bounded six-role Forge attempt has completed specifier, coder, and cleaner
    When architect fails or returns an invalid bound handoff
    Then hardener and QA do not run
    And CStar retains the three completed receipts and conservative partial-spend evidence
    And neither the failed role nor the orchestration attempt is relaunched

  Scenario: OAuth readiness fails before the attempt boundary
    Given the sealed Hermes cstar-hub profile is selected without passing credentials to CStar
    When MiniMax OAuth is missing, unsafe, refresh-required, or has less than 2100 seconds of life
    Then the redacted preflight fails before CStar reserves an attempt
    And no token, refresh token, credential path, expiry, or fingerprint enters CStar evidence
    And Forge does not refresh or write Hermes auth state

  Scenario: OAuth readiness is rebound immediately before provider spend
    Given a redacted minimax-oauth readiness proof passed before reservation
    When CStar prepares the sealed Hermes invocation
    Then Hermes repeats the same token-free readiness probe
    And CStar requires the second redacted proof to equal the first
    And only sealed Hermes may hold the access token in process memory

  Scenario: Durable replay needs no current OAuth token
    Given the idempotency key already identifies a durable Forge attempt
    When the same execute request is replayed after OAuth freshness changes
    Then CStar returns the existing receipt before OAuth readiness probing
    And no attempt is reserved and no provider process is invoked

  Scenario: Missing terminal evidence blocks delivery
    Given the bounded adapter has returned a candidate result
    When the terminal execution trace cannot be written or read back
    Then CStar does not return delivered status
    And durable failure evidence retains the Hermes runtime and last trace identity when available

  Scenario: The bounded topology is not represented as upstream SwarmForge
    Given upstream six-pack uses tmux, Git worktrees, and the role name hardender
    When CStar runs bounded-six-role-manifest-v1 without Git authority
    Then the receipt describes a no-Git bounded adaptation
    And the fifth role is named hardener only within that adaptation
