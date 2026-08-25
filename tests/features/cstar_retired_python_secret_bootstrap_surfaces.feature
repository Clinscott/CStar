Feature: Retired Python bootstrap and secret-bearing tools fail before effects
  Direct Python compatibility tools cannot bypass CStar lifecycle, Researcher,
  provider, or secret-management authority.

  Scenario: Bootstrap and live-source tools are tombstones
    Given synthetic environment values and an empty project directory
    When bootstrap, Brave Search, response harvest, or KnowledgeHunter is invoked
    Then the entrypoint returns its stable retirement error
    And it reads no dotenv config secret quota or live source
    And it starts no provider network process Hall state or callback effect
    And it writes no project fixture ledger report or vault artifact

  Scenario: Vault and provider probes are tombstones
    Given only synthetic provider and secret canaries
    When vault, model listing, or provider availability is invoked
    Then the entrypoint returns its stable retirement error
    And no key is generated rotated disclosed or persisted
    And no provider SDK or credential source is accessed

  Scenario: Redaction accepts explicit values only
    Given a caller supplies synthetic values directly in memory
    When the pure Redactor masks a supplied string
    Then only those supplied values are replaced
    And no vault environment config or filesystem fallback is attempted
