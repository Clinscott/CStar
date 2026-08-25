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

    Scenario: Stable root records are canonical and hash-derived
      Given a complete ordered structured root-user record set
      When mission ingress derives its authority binding
      Then bare strings and caller-supplied digest fields are rejected
      And top-level text must exactly match concatenated structured content
      And duplicate canonical records are rejected
      And modern record-set hashes never inherit singleton-v1 compatibility bytes

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

  Rule: The public coordinator is compatibility-first and kernel-derived

    Scenario: Ordinary bounded intent receives derived mission fields
      Given an ordinary bounded mission objective and design without derived fields
      When the public cstar_mission coordinator ingests the intent
      Then identifiers, canonical hashes, idempotency, adapter, and callback defaults are kernel-derived
      And caller-supplied identifiers, hashes, or immutable fields are rejected

    Scenario: Missing design returns typed input guidance
      Given an ordinary bounded mission objective without a design
      When the public cstar_mission coordinator ingests the intent
      Then the typed outcome is "needs_input"
      And the response contains an explicit next action
      And no durable queue intent is created

    Scenario: Guardrails preserve root, scope, and spend authority
      Given a mission with malformed ceilings, duplicate authority, or out-of-scope input
      When the public cstar_mission coordinator evaluates the intent
      Then the typed outcome is "guardrail_block"
      And the response contains an explicit next action
      And no worker, provider, Forge authorization, or spend is performed

    Scenario: Idempotent queueing returns the durable host boundary
      Given one valid bounded mission with an explicit idempotency key and queue request
      When the public cstar_mission coordinator ingests the same request twice
      Then the second response is an idempotent replay of the first durable queue receipt
      And both responses retain the derived mission and authority hashes
      And the host remains responsible for any worker launch

    Scenario: Queueing is not false completion
      Given a valid bounded mission authorized for host-owned queueing
      When the public cstar_mission coordinator returns a queued result
      Then the typed outcome is "ok"
      And the mission state is "DISPATCH_QUEUED"
      And "worker_launch_performed" is false
      And the result is not independent validation or lifecycle completion

    Scenario: Legacy singleton compatibility remains explicit
      Given the compatibility profile "legacy_singleton_v1"
      When the public cstar_mission coordinator canonicalizes one root-user record
      Then the legacy singleton record-set and message bytes remain available
      And modern derived mission identifiers remain scoped to that one request

  Rule: Public catalog and registration stay in parity

    Scenario: Default catalog exposes the coordinator and host completion boundary
      Given the default CStar kernel catalog
      Then "cstar_mission" and "cstar_forge_host_complete" are visible exactly once
      And each visible workflow tool has a catalog-backed schema and handler registration
