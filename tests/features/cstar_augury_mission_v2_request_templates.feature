Feature: Augury mission v2 Forge child request templates

  Rule: Version two is explicit and version one remains byte-compatible

    Scenario: A caller selects the strict v2 boundary
      Given the boundary schema is cstar.augury_mission_boundary.v2
      And the boundary version is 2
      When the verified current exact SET boundary is canonicalized
      Then the receipt schema is cstar.augury_mission_receipt.v2
      And version one bytes, hashes, replay, and accepted fixtures remain unchanged
      And neither version is silently reinterpreted as the other

  Rule: Every Forge child carries one canonical request template

    Scenario: A Forge plan item binds a canonical template
      Given the item lane is forge
      And the template has only the ForgeChildRequestTemplateV1 fields
      And every string, path, action tuple, metric, artifact, and package lock is valid
      When Augury binds the item
      Then the complete canonical template is retained in the ordered plan
      And its lowercase SHA-256 and UTF-8 byte count are derived and verified
      And project outputs are contained by the item targets
      And project Lore and Isolation paths are declared outputs

    Scenario: A non-Forge plan item cannot carry a template
      Given the item lane is not forge
      Then its template, template SHA-256, and template byte count are exactly null

    Scenario: A caller attempts to inject derived authority or runtime fields
      When the strict template parser sees an extra field
      Then the boundary fails closed before receipt emission
      And no source, spend, retry, provider, grant, execution, or runtime authority is created

  Rule: Aggregate identity binds exact ordered template bytes

    Scenario: A v2 receipt binds the complete ordered plan
      When all plan items are canonical
      Then ordered_plan_sha256 covers every complete v2 plan item
      And forge_request_template_count equals the number of Forge items
      And ordered_forge_request_templates_sha256 binds plan order, bead id, bytes, and hash
      And canonical_payload_sha256 covers the complete v2 payload

    Scenario: Exact replay detects template drift
      Given a v2 receipt has been materialized
      When a template is mutated, reordered, omitted, or given forged bytes or hash
      Then boundary replay or materialization replay fails closed
      And no stored child, membership, edge, request, authorization, attempt, or provider state is repaired

  Rule: Phase 4A stops before post-validation advancement

    Scenario: The v2 mission batch is materialized
      When receipt membership and child metadata copy the immutable template binding
      Then every child remains IN_PROGRESS
      And no Forge request, grant, authorization, attempt, provider call, or validation advancement occurs
