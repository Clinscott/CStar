Feature: CoS context refresh primer
  Scenario: Fresh CoS context is restored from durable state instead of chat replay
    Given a future CoS thread starts after the prior thread context is cleared
    When the refresh primer is generated
    Then it must cite CStar bead lifecycle state as canonical
    And it must include mapped-PMT, Forge, Researcher, CorvusEye, and PennyOne boundaries
    And it must record PMT unavailability as a freshness gap rather than a work gate
    And it must require mapped-PMT context when an in-scope mapping exists
    And it must record requested and actual mapped-PMT model identity separately
    And it must record MM as legacy with no active routing role
    And it must distinguish CStar as the deterministic state manager from CoS as the Codex orchestrator
    And it must forbid CoS self-implementation, self-research, self-debugging, and self-validation
    And it must define a workthread as host-issued retained/resumable continuity with stable lineage
    And it must require gpt-5.6-luna with max reasoning for substantive direct workers
    And it must visibly reject absent or mismatched model selectors without silent fallback
    And it must preserve Sol then distinct Terra max reasoning for Augury opinions
    And it must forbid CoS-owned host goals and every CoS host-goal lifecycle mutation
    And it must require one bounded worker goal bound to the exact bead, decision, paths, and checker
    And it must keep recoverable correction in the same retained workthread and goal
    And it must give replacement workers new goals with explicit bounded CStar handoff
    And it must reject host-goal status as CStar lifecycle authority
    And it must give distinct validators distinct validation goals
    And it must keep legacy CoS-held goals paused and historical
    And it must include a cycle breaker for degraded startup
    And it must treat perfect scores as review-pending until structurally audited
    And it must forbid raw transcript or log replay in the bootstrap prompt
