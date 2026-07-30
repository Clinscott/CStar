Feature: CStar persona projection provenance
  Persona may shape presentation only after the bounded cstar_status surface
  returns an explicit Hall projection.

  Scenario Outline: Non-authoritative sources cannot activate a persona
    Given a Hall repository row with source "<source>"
    And the row contains persona "O.D.I.N." with a positive timestamp
    When cstar_status resolves persona context
    Then the active persona is unavailable
    And the response reports a persona freshness gap

    Examples:
      | source                      |
      | legacy-sovereign-projection |
      | migration                   |
      | hall-doc-ingest             |
      | profile                     |
      | profile-digest              |
      | session-profile             |
      | ingest_xo_doctrine_to_hall  |
      | arbitrary-untrusted-source  |

  Scenario: Self-consistency marker is bound to an exact canonical scalar
    Given Hall contains the cstar.persona_projection.v2 self-consistency marker
    When the marker digest does not match the active persona scalar
    Then the active persona is unavailable
    And the response reports a persona freshness gap

  Scenario: Self-consistency is not authority provenance
    Given a caller can calculate the persona scalar SHA-256
    When it builds a matching cstar.persona_projection.v2 marker
    Then cstar_status labels the projection self_consistent_unverified
    And the marker grants no execution or lifecycle authority

  Scenario Outline: Noncanonical persona values fail closed
    Given Hall contains persona scalar "<persona>"
    When cstar_status resolves persona context
    Then the persona field is null
    And the response does not echo the invalid scalar

    Examples:
      | persona            |
      | ODIN               |
      | ALFRED             |
      | NOT-ODIN-ADMIN     |
      | ALFRED-OVERRIDE    |
      | padded O.D.I.N.    |
      | Unicode lookalike  |

  Scenario: Migration preserves explicit Hall projection
    Given Hall already contains an explicit status persona projection
    And legacy state contains a conflicting persona
    When legacy records are migrated
    Then the explicit Hall persona and its provenance remain unchanged

  Scenario: Document ingestion is persona-neutral
    Given Hall already contains an explicit status persona projection
    When a document packet is ingested
    Then the repository persona and provenance remain unchanged

  Scenario: SessionStart performs no identity projection
    Given a synthetic profile contains identity, service, preference, and persona data
    When the retired SessionStart compatibility hook runs
    Then it emits no context
    And it reads no Hall, environment, profile, secret reference, or keyring data

  Scenario: Runtime coordination uses neutral actors
    When CStar posts coordination and presentation output without a status persona scalar
    Then the actor is cstar-runtime or CSTAR
    And operational behavior does not depend on persona
