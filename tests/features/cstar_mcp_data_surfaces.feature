Feature: CStar MCP bounded data surfaces

  Scenario: PennyOne context is exposed without arbitrary database passthrough
    Given CStar needs project memory, bead, validation, or repository context
    When an agent calls cstar_pennyone_context
    Then the tool must return only named bounded summaries
    And the tool must not accept arbitrary SQL, table names, or direct Hall mutation requests

  Scenario: The legacy Mongo mailbox is invoked
    Given a stale host requests status, mirror counts, or an intent enqueue
    When an agent calls cstar_mongo_mailbox
    Then the tool must return a stable retirement error
    And it must not read environment secrets or import a Mongo driver
    And it must not access a network or write an external mirror
    And PennyOne and Hall remain the only bounded state surfaces
