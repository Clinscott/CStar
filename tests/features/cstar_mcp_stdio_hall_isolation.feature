Feature: MCP stdio integration Hall isolation
  Scenario: The canonical Node test runner protects the repository Hall
    Given a Node test requests Hall state for the CStar repository root
    When the test runs through the canonical TypeScript test launcher
    Then the Hall database must be stored under a disposable test root
    And parallel test processes must receive separate Hall database paths
    And explicit non-repository test roots must retain their requested paths

  Scenario: Launcher integration tests exercise a disposable Hall
    Given the CStar repository may contain an operational Hall database
    When the stdio launcher and TCP daemon integration tests start
    Then every integration process must use one disposable test workspace
    And the reported workspace must be the disposable test workspace
    And the repository Hall must not be selected as integration-test state
