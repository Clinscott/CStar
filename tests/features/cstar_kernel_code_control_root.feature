Feature: CStar kernel code and control roots remain separate
  The supported stdio kernel must execute validated source without forking Hall
  or reading runtime contracts from the dirty control root.

  Scenario: Clean source uses canonical control state
    Given a validated code root and a distinct canonical control root
    When the supported launcher starts the kernel
    Then source contracts adapters intent grammar and the watcher use the code root
    And Hall lifecycle telemetry logs Forge artifacts and target containment use the control root
    And no second .stats or pennyone.db is created under the code root

  Scenario: Unsafe control binding fails closed
    Given a missing relative symlinked wrong-owner or group-writable control root
    When the supported launcher evaluates the binding
    Then no child process starts
    And no fallback root or Hall store is created

  Scenario: Forge readiness is stricter than kernel root health
    Given a healthy code and control root binding
    But the code-root dependency tree is absent symlinked or lock-mismatched
    When status and doctor report current lineage
    Then kernel root binding may remain healthy
    But Forge readiness is false
    And no Forge request attempt or model spend occurs
