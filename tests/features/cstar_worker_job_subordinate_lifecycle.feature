Feature: Subordinate asynchronous worker-job ledger

  Rule: The ledger is transport below canonical CStar authority

    Scenario: Runtime exposure remains absent by default
      Given the subordinate worker-job feature flag is unset
      When the kernel tool catalog is inspected
      Then no worker-job tool is exposed
      And the ledger grants no request, authorization, execution, validation, or acceptance authority

    Scenario: One executable job binds the complete authority envelope
      Given a canonical CStar request and authorization exist elsewhere
      When a subordinate worker job is queued
      Then it binds the bead id and decision id
      And it binds the canonical request id and SHA-256
      And it binds the authorization id and expiry
      And it binds the adapter and runtime SHA-256
      And it binds the idempotency key and absolute execution deadline
      And it binds one attempt identity
      And it binds provider-started and spend-uncertainty evidence
      And none of those bindings create authority

  Rule: Queue mechanics never invent acceptance or retry authority

    Scenario: An idempotent replay is byte-equivalent
      Given a worker job already binds an idempotency key
      When the same executable contract is submitted again
      Then the existing job is returned
      But a changed contract fails with an idempotency conflict

    Scenario: A worker delivers all required artifacts
      Given the active attempt has provider-started and spend evidence
      And all required artifacts are staged
      When the worker finishes delivery
      Then the job becomes DELIVERED_UNVERIFIED
      And every delivered artifact becomes DELIVERED_UNVERIFIED
      And no success or acceptance state is recorded

    Scenario: A lease expires with exact zero-provider proof
      Given the lease belongs to the bound attempt
      And exact evidence proves zero provider requests and zero spend uncertainty
      When explicit lease recovery runs after expiry
      Then the job terminalizes without automatic retry
      And no queued replacement attempt is created

    Scenario: A lease expires without exact zero-provider proof
      Given provider start or spend cannot be excluded
      When explicit lease recovery runs after expiry
      Then the job becomes UNKNOWN
      And no automatic provider retry occurs

  Rule: Synthetic migration is atomic and fail closed

    Scenario: Every worker-job object is absent
      Given a caller-owned synthetic Hall database
      When the explicit migration helper runs
      Then one BEGIN IMMEDIATE transaction creates the current schema
      And a checksum-bearing migration ledger records the version
      And no database handle is cached

    Scenario: The complete exact-current schema exists
      Given every worker-job table and index has the exact current shape
      And the migration ledger checksum matches
      When the explicit migration helper runs
      Then it reports the schema as current
      And it changes no object

    Scenario: The schema is partial or incompatible
      Given at least one worker-job object is missing or has another shape
      When the explicit migration helper runs
      Then migration fails closed
      And no replacement or compatibility object is created

    Scenario: Migration fails after creating an object
      Given every worker-job object was absent before the transaction
      When a synthetic fault interrupts migration
      Then the transaction rolls back
      And zero worker-job objects remain

  Rule: Durable dispatch preserves the host launch boundary

    Scenario: CStar reserves one dispatch without launching cognition
      Given a queued job binds one canonical request and authorization
      When CStar reserves the durable dispatch handoff
      Then the job is leased for one bounded attempt
      And the handoff marks the host as the launch owner
      And CStar does not launch a worker, provider, daemon, or polling loop

    Scenario: Delivery is not validation or acceptance
      Given the host delivers the declared artifacts
      When CStar records delivery
      Then the job is DELIVERED_UNVERIFIED
      And independent validation must move it through VALIDATING
      And only an ACCEPTED validation can record acceptance

    Scenario: A local zero-provider failure queues same-batch repair
      Given local staging fails before any provider request or spend
      When the bounded repair transition is recorded
      Then the job is REPAIR_QUEUED on the same mission and batch
      And one exact zero-provider replay may return the same attempt to QUEUED
      And the retry ceiling is explicit and finite

    Scenario: Ambiguous provider spend is permanently frozen
      Given provider start or spend cannot be excluded
      When the dispatch recovery transition is recorded
      Then the job is UNKNOWN
      And no replay, retry, or repair transition is allowed
