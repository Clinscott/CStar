Feature: Immutable autonomous Hermes dispatch policy

  Rule: A policy is explicit and bounded when it is created

    Scenario: A CStar policy parent creates one immutable Forge child
      Given a same-root CStar policy parent with a bounded provider ceiling
      And an immutable child with exact target paths, template, MiniMax adapter, and zero retries
      When cstar_forge_request records the matching synthetic-only request
      Then CStar derives an autonomous_dispatch_policy_v1 authorization receipt
      And no public cstar_forge_authorize call or ordinary-language SET phrase is required
      And the receipt permits exactly one provider attempt through Hermes MiniMax

    Scenario: An autonomous request is replayed from the same root
      Given a previously authorized unchanged autonomous policy request
      When the same-root workflow requests the same immutable child again
      Then CStar returns the original request, grant, and authorization receipts
      And it creates no duplicate grant, authorization, or provider attempt

  Rule: Policy scope cannot silently expand

    Scenario: A child target, parent policy, or request scope drifts
      When immutable metadata, path containment, output scope, retry budget, or callback binding differs
      Then CStar fails closed before provider execution
      And compatibility authorization cannot replace the policy profile

    Scenario: The operator revokes a policy after authorization
      Given an autonomous policy grant exists
      When a later canonical root-user record says Stop or otherwise revokes Forge work
      Then CStar revokes the linked mission grant
      And cstar_forge_execute cannot reserve a provider attempt
