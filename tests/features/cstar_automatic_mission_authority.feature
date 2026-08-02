Feature: Compatibility-first ordinary-language mission ingress and SET authority

  Rule: CStar is a deterministic state manager

    Scenario: Objective-only ingress asks for bounded design
      Given an ordinary-language mission objective without a design
      When the internal cstar_mission contract ingests the objective
      Then the typed outcome is "needs_input"
      And the mission state is "NEEDS_DESIGN"
      And no worker or provider is launched

    Scenario: One exact SET grant binds one bounded mission
      Given a stable root-user instruction record
      And a design with a root task, targets, outputs, prohibitions, ceilings, and expiry
      When the mission authority selects the operative record
      Then exactly one SET grant is bound
      And the grant binds the mission, design hash, root task, targets, outputs, prohibitions, retry ceiling, attempt ceiling, spend ceiling, and expiry
      And a generic mission grant is not reusable for another mission

    Scenario: Informational prose does not authorize a mission
      Given a root-user turn containing an informational record and one exact operative SET record
      When the mission authority evaluates the complete ordered record set
      Then the selected grant is bound to the exact operative record
      And the full record-set hash is stored

    Scenario: Duplicate and mixed operative grants fail closed
      Given a root-user turn containing two operative mission or receipt grants
      When the mission authority evaluates the complete ordered record set
      Then the authority outcome is "guardrail_block"
      And no grant is materialized

    Scenario: Nonoperative forms never become authority
      Given a question, conditional, quote, example, report, modal, negation, revocation, or identifier suffix collision
      When the mission authority evaluates the text
      Then the authority outcome is "guardrail_block"

    Scenario: Legacy singleton compatibility is explicit
      Given the compatibility profile "legacy_singleton_v1"
      When one root-user instruction record is canonicalized
      Then the exact singleton-v1 record-set bytes and hash remain available
      And the modern SET binding remains scoped to that one mission

  Rule: Dispatch is host-owned

    Scenario: Queueing does not launch workers
      Given a valid bounded SET mission
      When CStar advances the mission through MATERIALIZED to DISPATCH_QUEUED
      Then the typed outcome is "ok"
      And the dispatch projection says "worker_launch_performed" is false
      And the host is responsible for any later worker launch
