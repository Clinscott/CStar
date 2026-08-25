Feature: CStar operator workflow router

  Rule: One situation selects one narrow workflow

    Scenario Outline: Route bounded Corvus work
      Given CoS is handling "<situation>"
      When it selects the next supported workflow
      Then it uses "<surface>"
      And it follows "<contract>"
      And capability declarations and runtime evidence grant no extra authority

      Examples:
        | situation                      | surface                                                            | contract                                                    |
        | kernel health is unknown       | cstar_doctor                                                       | docs/integrations/cstar-kernel-mcp.md                       |
        | a known mission resumes        | cstar_handoff                                                      | docs/operations/cstar-goal-driven-daily-bootstrap.md        |
        | route or scope is ambiguous    | cstar_augury without mission_boundary then at most one bounded cstar_hall_search | docs/integrations/cstar-kernel-mcp.md              |
        | a new SET/design is ready      | one cstar_augury mission_boundary v2 with v1 compatibility          | docs/integrations/cstar-kernel-mcp.md                       |
        | implementation is requested    | cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute | docs/operations/corvus-forge-pipeline-playbook.md           |
        | external evidence is requested | cstar_researcher_request                                           | .agents/skills/researcher/SKILL.md                          |
        | delivery needs validation      | independent cstar_record_result -> automatic next-child advancement | docs/operations/corvus-forge-pipeline-playbook.md          |
        | mapped project context is due  | one bounded PMT read and one compact state update                   | docs/architecture/cos-pmt-thread-architecture.md            |
        | daily freshness is due         | daily bootstrap                                                    | docs/operations/cstar-goal-driven-daily-bootstrap.md        |
        | persona posture changes        | cstar_persona_set at the next workflow boundary                     | docs/operations/cstar-iterative-development.md              |
        | CoS context rotates            | cstar-closeout and one bounded generated handoff                    | docs/operations/cos-context-refresh-new-thread-packet.md    |

  Rule: CStar is state management and CoS is orchestration

    Scenario: Deterministic state and host orchestration remain separate
      Given CoS is operating in Codex
      Then CStar is only the deterministic state manager
      And CoS is the supervisor/delegator
      And CStar does not launch agents, workthreads, providers, or cognition
      And CoS does not implement, research, debug, edit source, run worker tests or validation, or take over failed worker work

    Scenario: Delegated model selection is visible and fail-closed
      Given a substantive direct Codex subagent or retained/resumable workthread is dispatched
      Then it requests "gpt-5.6-luna" with reasoning effort "max" through an enforcing host selector
      And requested model and effort are recorded separately from actual identity
      And selector absence or mismatch is visible and never silently falls back

    Scenario: Workthreads remain host-issued
      Given CoS needs retained worker continuity
      Then a workthread is a retained/resumable host-issued worker thread with stable lineage
      And CStar does not launch a worker thread or provider
      And no runtime support is claimed unless the host exposes it

    Scenario: Augury keeps its distinct advisory exception
      Given an Augury opinion is required
      Then the first opinion requests "gpt-5.6-sol" with reasoning effort "max"
      And a second opinion requests distinct "gpt-5.6-terra" with reasoning effort "max"

  Rule: Host goals belong to workers, not CoS

    Scenario: CoS cannot own or mutate a host goal
      Given CoS is operating in Codex
      Then CoS owns no host goal
      And CoS must never create, resume, update, pause, block, complete, or close a host goal
      And every substantive implementation, research, debug, or validation assignment goes to a Luna Max worker

    Scenario: Worker goals bind one bounded assignment
      Given a Luna Max worker or retained workthread receives a substantive assignment
      Then it owns exactly one bounded host goal
      And the worker goal objective binds the exact CStar bead, decision, target paths, and checker contract
      And host goal status is worker-local evidence, never CStar lifecycle truth

    Scenario: Correction and replacement continuity are explicit
      Given a worker needs recoverable correction
      Then correction remains in the same retained workthread and same goal
      When a replacement worker is required
      Then it receives a new host goal and an explicit bounded CStar handoff
      And it never inherits hidden host-goal state or silently receives a transferred goal

    Scenario: Validators and legacy CoS goals remain separated
      Given implementation evidence needs independent validation
      Then a distinct validator owns a distinct validation goal
      And the validator never reuses the implementation goal
      And legacy CoS-held goals remain paused and historical until a supported transfer exists
      And they are never deleted, silently resumed, or falsely completed

  Rule: Persona changes process posture, not authority

    Scenario: O.D.I.N. leads an authorized build
      Given cstar_status reports O.D.I.N.
      And objective, targets, actions, spend, and source boundaries are unchanged
      When focused validation exposes a recoverable local failure
      Then keep the current plan step active
      And repair through the owning lane
      And rerun focused validation before expanding scope

    Scenario: A persona-guided iteration reaches an authority boundary
      When repair requires a newly gated effect
      And that effect is spend, retry, scope, source, Git, restart, deploy, secret access, destructive action, or an execution-boundary change
      Then persist the exact evidence and next gate
      And request the exact missing operator grant
      And do not infer authority from persona

  Rule: Context repositories never own work

    Scenario: A mapped PMT is unavailable
      Then record a freshness gap
      And continue from current CStar evidence when otherwise authorized
      And give MM no routing role

  Rule: Live work is not polled or duplicated

    Scenario: A worker or provider attempt is still live
      Then pause until the supported completion or status surface reports change
      And do not launch another attempt

  Rule: Missing authority fails closed

    Scenario: A required operator grant is absent
      Then persist the exact missing grant and bounded evidence
      And stop before the gated effect
