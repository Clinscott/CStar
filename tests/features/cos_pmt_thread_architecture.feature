Feature: CoS and project-context thread architecture
  Scenario: PMTs provide context without owning work
    Given CoS has a Corvus estate goal
    When the target belongs to a project with a mapped PMT
    Then CoS reads one bounded project-context packet
    And PMT availability is a freshness signal rather than an execution gate
    And the PMT grants no ownership, execution, review, approval, or routing authority
    And CoS sends a compact state update after meaningful work
    And the query requests Luna, Terra, or Sol only through an enforceable selector
    And requested and actual model identity are recorded separately

  Scenario: Current work routes through active CStar spokes
    Given CoS has represented the work in CStar
    When the next bounded action is selected
    Then Forge builds implementation through the durable Forge path
    And Researcher gathers evidence through authorized lanes
    And CorvusEye performs independent evaluation when required
    And MM has no active routing or relay role

  Scenario: CStar manages state while CoS delegates worker work
    Given CoS is operating in Codex
    When a bounded worker assignment is needed
    Then CStar remains only the deterministic state manager
    And CoS binds and sequences CStar state as the supervisor/delegator
    And CoS dispatches the owning worker and reviews returned evidence
    And CoS does not implement, research, debug, edit source, run worker tests or validation
    And CoS does not silently take over failed worker work
    And CStar does not launch an agent, workthread, provider, or model cognition

  Scenario: Direct workers and workthreads use an explicit host selector
    Given a substantive direct Codex subagent or retained/resumable workthread is dispatched
    Then it requests gpt-5.6-luna with reasoning effort max through an enforceable host selector
    And requested model and effort are recorded separately from actual identity
    And selector absence or mismatch is visible and never silently falls back
    And a workthread is a host-issued retained/resumable thread with stable lineage
    And no runtime support is claimed unless the host exposes it

  Scenario: Augury keeps a distinct model exception
    Given an Augury opinion is required
    Then the first opinion requests gpt-5.6-sol with reasoning effort max
    And a needed second opinion requests distinct gpt-5.6-terra with reasoning effort max

  Scenario: Host goals are worker-owned evidence
    Given a substantive implementation, research, debug, or validation assignment is needed
    Then CoS owns no host goal
    And CoS never creates, resumes, updates, pauses, blocks, completes, or closes a host goal
    And a Luna Max worker or retained workthread owns exactly one bounded host goal
    And the worker goal objective binds the exact CStar bead, decision, target paths, and checker contract
    And host goal status is worker-local evidence, never CStar lifecycle truth

  Scenario: Worker correction and replacement are explicit
    Given a worker has a recoverable correction
    Then correction remains in the same retained workthread and same goal
    When a replacement worker is required
    Then it receives a new host goal and an explicit bounded CStar handoff
    And it never inherits hidden host-goal state or silently receives a transferred goal

  Scenario: Validation and legacy goal ownership stay separate
    Given implementation evidence needs independent validation
    Then a distinct validator owns a distinct validation goal
    And the validator never reuses the implementation goal
    And legacy CoS-held goals remain paused and historical until a supported transfer exists
    And legacy goals are never deleted, silently resumed, or falsely completed

  Scenario: The User is asked only for high-order or red-gated decisions
    Given CoS is executing bounded Green or Yellow work
    When a repair stays inside the authorized boundary
    Then CoS requests correction through the owning lane or records a durable successor repair
    And a missing PMT cannot park or block the goal
    But red gates require explicit CoS or User authorization
