Feature: Atomic mission materialization at an Augury SET boundary

  Rule: Boundary mode commits before returning usable mission state

    Scenario: A new exact SET boundary materializes one complete batch
      Given the receipt repository and targets resolve under the live CODE_ROOT
      And the parent bead and Hall repository resolve under the distinct control root
      When Augury finalizes and dispatches the verified mission receipt
      Then one Hall transaction stores the receipt, every ordered child, and every dependency edge
      And only after commit the response includes the receipt, complete plan, ordered bead ids, and materialization replay state
      And the parent metadata bytes are unchanged

    Scenario: A 64-child mission remains completely visible
      Given an exact SET mission contains 64 ordered children
      When Augury materializes the mission
      Then the response contains all 64 plan items and ordered bead ids
      And the response does not depend on a capped cstar_bead list

    Scenario: A materialization failure exposes no usable batch
      Given the parent is stale, a child id collides, or a mid-batch write fails
      When Augury attempts mission materialization
      Then the Hall transaction rolls back every new receipt, child, membership, and edge row
      And Augury returns the exact typed augury_mission failure
      And the response includes no receipt, plan, ordered bead ids, or partial batch

  Rule: SET replay is explicit and dispatch remains deferred

    Scenario: Exact replay requires the prior binding
      Given one Augury call already materialized the exact SET boundary
      When the same boundary is called without its replay binding
      Then Augury fails with augury_mission_materialization_replay_binding_required
      When the exact prior payload, receipt, count, and ordered-plan binding is supplied
      Then Augury returns materialization replayed true without creating another batch

    Scenario: A different receipt collides at the same boundary
      Given one receipt is materialized for a mission decision and parent
      When a different valid receipt targets the same decision and parent
      Then Augury fails with augury_mission_materialization_receipt_conflict

    Scenario: Augury never starts Forge
      When Augury materializes an exact SET mission
      Then no Forge request, authorization call, provider attempt, or provider start occurs
      When the first child is subsequently sent to cstar_forge_request
      Then Forge derives AUTHORIZED automatic mission-grant state
      And dispatch_execution attempted is false with zero attempts

  Rule: Ordinary advisory Augury remains read-only

    Scenario: A non-boundary advisory call is byte compatible
      When ordinary Augury resolves without a mission boundary
      Then it returns the existing advisory bytes
      And it performs no Hall write
