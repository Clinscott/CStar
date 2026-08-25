Feature: CoS context refresh primer
  Scenario: Fresh CoS context is restored from durable state instead of chat replay
    Given a future CoS thread starts after the prior thread context is cleared
    When the refresh primer is generated
    Then it must preserve platform, operator, repository, and CStar authority order
    And it must include PMT-information, Forge, Researcher, CorvusEye, and PennyOne boundaries
    And it must mark MM as legacy and PMTs as non-authoritative information repositories
    And it must include a cycle breaker for degraded startup
    And it must treat perfect scores as review-pending until structurally audited
    And it must forbid raw transcript or log replay in the bootstrap prompt

  Scenario: Static bootstrap guidance cannot masquerade as current state
    Given the reusable new-thread document is a static bootstrap pointer
    When a future CoS uses it to start a thread
    Then the pointer must say it is not a schema instance or current estate state
    And the source refresh bead must be marked resolved
    And live health, handoff, bead, and validation state must be refreshed
    And schema mode invariants must be validated with representative packets
