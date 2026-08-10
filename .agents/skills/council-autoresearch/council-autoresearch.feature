Feature: Bounded Council autoresearch

  Rule: The registered terminal workflow is explicit and externally trusted

    Scenario: The skill is discovered
      Then Council autoresearch is registered as an active agent-native skill
      And its entry surface is cli with an explicit terminal-required contract
      And every host uses the exec-bridge without kernel fallback
      And registration grants no source, Git, provider, Hall, deployment, or promotion authority

    Scenario: Trust is provisioned before a run
      Given a private external trust policy pins one Ed25519 host signer, receipt issuer, allowed channels, canonical runner repository URL, and branch
      And the corresponding private key remains in the authorized host invocation bridge
      When a packet presents an execution authority and runner checkpoint
      Then both must match the preprovisioned trust policy
      And the runner never creates, selects, or authorizes the signer

    Scenario: The runtime lacks POSIX no-follow guarantees
      When the platform is Windows or O_NOFOLLOW is unavailable
      Then the runner fails closed before reading or writing run evidence

  Rule: One source owner freezes one evidence identity

    Scenario: A run begins from committed source
      Given one bounded run id and explicit governed paths
      When the host acquires the repository-wide source lease
      Then the lease binds the exact HEAD and recursive source manifest
      And a failed contender cannot remove the acquired lease

    Scenario: A command process exits while holding the operation guard
      Given the guard binds the active lease and resume-token digest
      When its same-host owner PID is confirmed absent
      Then the next authorized command may recover that exact stale guard
      And live, foreign-host, malformed, or differently bound guards remain locked

    Scenario: Evidence is preregistered
      Given the source lease is valid
      When the host freezes the Council packet
      Then one packet hash binds a verified contract manifest, both anonymous variants, evidence, rubric, protocols, seed, order, mapping commitment, quorum, protected axes, runner publication, and Token-Path quarantine
      And the runner publication binds the exact canonical path-to-digest map at a trust-pinned canonical remote URL and branch
      And every later receipt must carry that exact packet hash

    Scenario: A different packet is replayed for a frozen run
      When its packet bytes conflict with the immutable packet
      Then the replay fails before creating another experiment claim

    Scenario: Host executions are admitted
      Given one preregistered Ed25519 execution authority
      When exactly 19 unique signed execution receipts bind the packet, protocol, inputs, and rating outputs
      Then unsigned, reused, or drifted executions fail closed
      And no mapping reveal exists in the ratings receipt

  Rule: Council ratings remain bounded evidence

    Scenario: The panel prefers a candidate
      Given exactly 19 unique signed protocol-bound ratings
      And the mapping reveal matches the preregistered commitment
      And the non-tie quorum is met
      When the bounded related-panel heuristic crosses its candidate boundary
      Then the decision is ACCEPTED
      And the receipt disclaims independent trials, population inference, and empirical error guarantees

    Scenario: A protected axis regresses
      When any rating declares a protected candidate regression
      Then the decision is REJECTED_PROTECTED_AXIS
      And promotion is forbidden

    Scenario: Too few effective preferences exist
      When ties leave the panel below its preregistered non-tie quorum
      Then the decision is INCONCLUSIVE
      And promotion is forbidden

  Rule: Formal run state does not turn an advisory evaluator into authority

    Scenario: Frozen evidence is evaluated
      Given one structurally and cryptographically valid packet, ratings receipt, and later mapping reveal
      When the pure deterministic evaluator computes a verdict
      Then it performs no source, Hall, Git, provider, deployment, or promotion effect
      And ACCEPTED, REJECTED, REJECTED_PROTECTED_AXIS, and INCONCLUSIVE remain advisory evidence

  Rule: Exactly one generation completes before the operator pause

    Scenario: Generation one is evaluated
      Given one frozen packet, one frozen ratings receipt, and one later mapping reveal
      When the host writes the immutable decision receipt
      Then generation one is complete exactly once
      And conflicting replay fails without overwrite

    Scenario: Publication is verified
      Given the decision receipt exists
      And separate Git authority published the exact required files
      When the remote ref, commit, and hashes verify
      And the semantic packet, ratings, reveal, and decision paths each carry the digest of their declared receipt role
      Then the immutable publication receipt derives PAUSED
      And the host reports and stops

    Scenario: A runner checkpoint is verified
      Given a separately authorized configured-remote read
      When verify-runner-checkpoint resolves the pinned remote URL, branch, commit, and canonical file map
      Then every canonical runner path and digest must match the local runner manifest exactly
      And no fetch, push, or Git rewrite is authorized

    Scenario: A second generation is requested
      Then no command or receipt path exists for generation two
      And the request fails closed

  Rule: Token-Path remains quarantined

    Scenario: Any packet or receipt exposes Token-Path
      Then it is quarantined, non-actionable, non-steering, and write-disabled
      And any conflicting field fails closed
      And signed execution channels attest that Token-Path was neither read nor written
