Feature: CoS context refresh primer
  Scenario: Fresh CoS context is restored from durable state instead of chat replay
    Given a future CoS thread starts after the prior thread context is cleared
    When the refresh primer is generated
    Then it must cite CStar bead lifecycle state as canonical
    And it must include PMT, Forge, Researcher, CorvusEye, and PennyOne boundaries
    And it must include a cycle breaker for degraded startup
    And it must treat perfect scores as review-pending until structurally audited
    And it must forbid raw transcript or log replay in the bootstrap prompt
