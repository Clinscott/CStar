Feature: Forge authorization uses normal operator language
  The operator names accepted work while Codex fills and binds the machine contract.

  Scenario: One build instruction identifies one pending request
    Given one immutable synthetic-only zero-retry Forge request matches the active bead or decision
    When the root user says to build implement repair fix or route that exact work through Forge
    Then cstar_forge_authorize binds that singleton operator turn to the request
    And no machine challenge is exposed in the normal v3 operator workflow
    And no provider is invoked before cstar_forge_execute

  Scenario: A concise operator label uniquely identifies one pending request
    Given CStar derives an exact label from target identity tokens and structured decision stage tokens
    When the root user says Build the TokenPath Q0 phase-one repair
    Then CStar selects the only eligible request with that complete ordered normalized label
    But a partial reordered date-only internal-activity or multiply matching label fails closed

  Scenario: A fresh named resume instruction follows activation
    Given a supported host restart preserved the goal and one unchanged unspent request
    When the current root user says Continue building the TokenPath Q0 phase-one repair
    Then cstar_forge_authorize binds only that current instruction to the request
    And earlier build prose is not replayed as authority

  Scenario: A goal-only host resume asks for an operator signal
    Given Codex resumes with only a reserved goal-context packet
    When cstar_forge_authorize evaluates the unchanged unspent request
    Then it returns forge_operator_signal_required with one human-readable next action
    And it creates no authorization attempt or provider spend
    But restart acknowledgements status questions and bare continuations remain insufficient

  Scenario: The operator instruction is not operative or not unique
    Given the current text is a question example hypothetical negation revocation or bare continuation
    Or its work reference matches zero or multiple eligible requests
    When cstar_forge_authorize evaluates the turn
    Then it returns forge_operator_authorization_required
    And creates no authorization attempt or provider spend

  Scenario: An older exact-profile v3 request remains unspent
    Given the operator explicitly names its exact bead decision or canonical target reference
    When cstar_forge_authorize verifies that instruction
    Then it may atomically transition the request to root_user_forge_intent_v1
    But cstar_forge_request cannot perform that profile transition

  Scenario: Preserved v2 compatibility is required
    Given an immutable unspent cstar.forge_request.v2 receipt
    When its compatibility sidecar is authorized
    Then the internal exact challenge remains available only for compatibility
    And it is never presented as the normal operator UX
