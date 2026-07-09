Feature: CStar MCP bounded data surfaces

  Scenario: PennyOne context is exposed without arbitrary database passthrough
    Given CStar needs project memory, bead, validation, or repository context
    When an agent calls cstar_pennyone_context
    Then the tool must return only named bounded summaries
    And the tool must not accept arbitrary SQL, table names, or direct Hall mutation requests

  Scenario: Mongo mailbox is a mirror and intent queue, not a source of truth
    Given CStar Console or a host process needs mailbox-style synchronization
    When an agent calls cstar_mongo_mailbox
    Then the tool must expose only status, mirror counts, and operator-authorized intent enqueue
    And Mongo state must not replace PennyOne or Hall as the source of truth
    And arbitrary Mongo queries or caller-selected collections must be rejected by design
