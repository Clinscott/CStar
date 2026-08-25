Feature: Deterministic Augury receipt at a new SET mission boundary

  Rule: Augury projects a complete plan without creating beads

    Scenario: A verified exact root SET binds one complete mission design
      Given a verified exact root SET thread, turn, record hash, and ordered record-set hash
      And an exact repository root, mission decision, proposed parent bead, design, scope, and ordered target set
      And a complete ordered bead plan with dependencies, lanes, targets, acceptance obligations, and checker obligations
      When read-only Augury resolves the new mission boundary
      Then it returns a cstar.augury_mission_receipt.v1 receipt and the complete visible plan
      And the receipt binds deterministic Council category, tier, expert, candidates, and guardrails
      And the receipt contains bounded counts, a canonical payload hash, and a deterministic receipt id
      And Augury creates no bead and persists no truncated plan

    Scenario: Exact mission-boundary replay is byte-stable
      Given a previously built mission-boundary receipt
      When the exact verified input is replayed with its payload hash and receipt id
      Then the canonical receipt bytes are unchanged

    Scenario Outline: Bound mission input drifts
      Given a previously built mission-boundary receipt
      When the bound "<field>" changes while the prior replay binding is supplied
      Then Augury fails closed with "augury_mission_replay_mismatch"

      Examples:
        | field              |
        | SET record hash    |
        | ordered record set |
        | normalized scope   |
        | contained target   |
        | design             |
        | bead plan          |

  Rule: SET authority is exact and mission plans are never truncated

    Scenario Outline: Non-SET prose is not accepted as SET verification
      Given a mission identity marked as "<signal>"
      When the mission receipt is requested
      Then Augury fails closed with "augury_mission_set_identity_invalid"

      Examples:
        | signal      |
        | question    |
        | quotation   |
        | conditional |
        | revocation  |

    Scenario: A plan exceeds the contract bound
      Given a mission plan contains more than 64 beads
      When the mission receipt is requested
      Then Augury fails closed with "augury_mission_plan_limit_exceeded"
      And no truncated plan is persisted or hashed

    Scenario: A plan omits a contained mission target
      Given a contained target is absent from every planned bead
      When the mission receipt is requested
      Then Augury fails closed with "augury_mission_plan_incomplete"

  Rule: Existing Augury behavior remains compatible

    Scenario: A legacy advisory call omits mission-boundary fields
      When Augury resolves the advisory call
      Then it returns the current routing response without a mission receipt or mission plan

    Scenario: An active session diverges from the new mission targets
      Given an active session does not cover the explicit mission targets
      When Augury resolves the new mission boundary
      Then the existing stale-session divergence blocker wins
      And no mission receipt is emitted

    Scenario: An ordinary child repair stays within an accepted design
      Given no new SET or design boundary exists
      When the child repair continues
      Then no new mission-boundary Augury receipt is required
