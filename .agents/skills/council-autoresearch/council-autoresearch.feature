Feature: Bounded Council autoresearch

  Rule: One source owner freezes one evidence identity

    Scenario: A run begins from committed source
      Given one bounded run id and explicit governed paths
      When the host acquires the repository-wide source lease
      Then the lease binds the exact HEAD and recursive source manifest
      And a failed contender cannot remove the acquired lease

    Scenario: Evidence is preregistered
      Given the source lease is valid
      When the host freezes the Council packet
      Then one packet hash binds both anonymous variants, evidence, rubric, protocols, seed, order, mapping commitment, quorum, protected axes, runner publication, and Token-Path quarantine
      And every later receipt must carry that exact packet hash
      And the clean executing checkout matches the remotely published runner checkpoint

    Scenario: A receipt commit is interrupted
      Given a durable receipt body exists without its source-bound seal
      Then the body advances no lifecycle phase
      And recovery re-attests the exact governed source before removing the dead-operation guard

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
      Then the immutable publication receipt derives PAUSED
      And the host reports and stops

    Scenario: Published receipt contents are path-swapped
      When a valid receipt digest is published under another receipt role's path
      Then publication and later status fail closed

    Scenario: A second generation is requested
      Then no command or receipt path exists for generation two
      And the request fails closed

  Rule: Token-Path remains quarantined

    Scenario: Any packet or receipt exposes Token-Path
      Then it is quarantined, non-actionable, non-steering, and write-disabled
      And any conflicting field fails closed
      And signed execution channels attest that Token-Path was neither read nor written
