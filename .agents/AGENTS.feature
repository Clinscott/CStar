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
        | route or scope is ambiguous    | cstar_augury then at most one bounded cstar_hall_search             | docs/integrations/cstar-kernel-mcp.md                       |
        | implementation is requested    | cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> independent cstar_record_result | docs/operations/corvus-forge-pipeline-playbook.md |
        | external evidence is requested | cstar_researcher_request                                           | .agents/skills/researcher/SKILL.md                          |
        | delivery needs validation      | independent cstar_record_result                                    | docs/operations/corvus-forge-pipeline-playbook.md           |
        | mapped project context is due  | one bounded PMT read and one compact state update                   | docs/architecture/cos-pmt-thread-architecture.md            |
        | daily freshness is due         | daily bootstrap                                                    | docs/operations/cstar-goal-driven-daily-bootstrap.md        |
        | persona posture changes        | cstar_persona_set at the next workflow boundary                     | docs/operations/cstar-iterative-development.md              |
        | CoS context rotates            | cstar-closeout and one bounded generated handoff                    | docs/operations/cos-context-refresh-new-thread-packet.md    |

  Rule: Role and language boundaries remain explicit

    Given CoS coordinates operator-facing work
    Then Forge implements, Researcher gathers evidence, and an independent validator evaluates
    And ordinary Forge and Researcher use remains coordinator-decided
    And ordinary operator instructions are not rewritten into robot-language prompts

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
      And MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role

  Rule: Live work is not polled or duplicated

    Scenario: A worker or provider attempt is still live
      Then pause until the supported completion or status surface reports change
      And do not launch another attempt

  Rule: Missing authority fails closed

    Scenario: A required operator grant is absent
      Then persist the exact missing grant and bounded evidence
      And stop before the gated effect
