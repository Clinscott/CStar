Feature: Atomic Forge post-validation mission advancement

  Rule: Accepted delivery finalization is authoritative before advancement

    Scenario: An accepted v2 Forge child advances one deterministic frontier
      Given cstar_record_result durably accepts an independently verified Forge delivery
      And the delivery belongs to an immutable Augury mission v2 child
      When the separate no-provider advancement transaction succeeds
      Then Sterling resolves the accepted child from its template Lore and Isolation paths
      And exactly the lowest unresolved dependency-satisfied Forge successor is AUTHORIZED
      And no attempt, reservation, worker job, provider start, spend, or live source is created
      And cstar_forge_execute remains the only later provider boundary

    Scenario: Advancement fails after validation commits
      Given authoritative acceptance is already durable
      When receipt, graph, grant, dependency, Sterling, request, link, or authorization checks fail
      Then the advancement transaction rolls back child resolution and successor state
      And the accepted validation and completed Forge delivery remain authoritative
      And the response reports a typed failed advancement without downgrading validation

  Rule: Frontier selection never skips unresolved work

    Scenario: A manual v2 request tries to skip the receipt frontier
      Given child one is delivered but not yet authoritatively accepted
      And child two and child three remain unresolved
      When a public Forge request targets child three
      Then the request fails before request or authorization persistence
      And the typed reason is forge_augury_v2_frontier_earlier_unresolved

    Scenario: Acceptance races an earlier rejected manual request
      Given a manual request for child three was rejected at the frontier
      When child one is accepted
      Then automatic advancement authorizes exactly child two
      And child three has no request or authorization

    Scenario: Another connection races the guard and request insert
      Given manual request persistence owns one immediate transaction
      When a second connection tries to mutate the frontier after the guard
      Then the competing write cannot enter before request insertion
      And an injected abort rolls back the request with no authorization row

    Scenario: The next unresolved item belongs to another lane
      When the accepted Forge child is resolved
      Then advancement returns domain_terminal
      And it creates no later Forge request

    Scenario: Every mission item is resolved
      When the accepted final Forge child is resolved
      Then advancement returns batch_complete

    Scenario: An earlier child or required dependency is unresolved
      Then advancement fails closed
      And no later eligible-looking Forge child is selected

  Rule: Immutable authority is derived rather than caller supplied

    Scenario: A successor request is materialized
      Then objective and validation paths come from the immutable child template
      And target, decision, callback, root identity, adapter, seals, and grant come from lineage
      And attempt limit is one, retry budget is zero, fixtures are synthetic only
      And live source collection is false
      And template data cannot inject identity, authority, spend, or provider fields

    Scenario: Exact record replay or an exact manual request race occurs
      Then the same advancement receipt and successor authorization are returned
      And no duplicate request, authorization, grant link, or side effect is created

    Scenario: A manual request diverges at the same child decision
      Then advancement fails with a request conflict
      And accepted validation remains durable

  Rule: Compatibility outside Augury v2 is unchanged

    Scenario: A legacy or non-Augury request uses its existing authorization path
      Given no immutable Augury v2 receipt membership applies
      Then the shared frontier guard is not applicable
      And existing compatibility authorization behavior is preserved
