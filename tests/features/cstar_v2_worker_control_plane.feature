Feature: CStar v2 worker control plane

  Rule: Worker-job tools are a strict opt-in surface

    Scenario: Worker-job tools stay absent by default
      Given CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2 is unset or is not exactly "1"
      When an MCP client requests tools/list
      Then cstar_start_worker_job must be absent
      And cstar_get_worker_job must be absent
      And cstar_cancel_worker_job must be absent
      And cstar_fetch_worker_artifact must be absent

    Scenario: Enabling v2 exposes only the inert worker-job primitives
      Given the environment contains CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2=1
      When an MCP client requests tools/list
      Then the four v2 worker-job tools are registered once
      And registration must not start Hermes, MiniMax, Forge, or Researcher
      And the preliminary surface must report execution_available as false

  Rule: Legacy mutation and execution surfaces fail closed by default

    Scenario: Legacy live execution requires an exact server gate
      Given CSTAR_KERNEL_ENABLE_LEGACY_LIVE_EXECUTION is unset or is not exactly "1"
      When a caller supplies arbitrary authorization text to legacy dispatch or Forge execution
      Then no execution adapter may be invoked
      And the response must not echo the authorization text
      And the call must report legacy_live_execution_disabled

    Scenario: AutoBot and Mongo writes require independent exact server gates
      Given the legacy server opt-ins are unset
      When an MCP client inspects or invokes the legacy surfaces
      Then cstar_autobot must be absent
      And a Mongo operator intent must not be persisted
      And caller-authored authorization text must not appear in the Mongo schema or record

    Scenario: Persistence failure cannot fabricate evidence
      Given the Hall rejects a validation-result write
      When cstar_record_result handles the failure
      Then the response must be an error with code PERSISTENCE_FAILED
      And persisted must be false
      And no secondary token-path observation may be recorded
      And internal persistence details must not be returned

    Scenario: Spoke reads never disclose raw mount authority
      Given a mounted spoke has authority tokens in Hall or on disk
      When an MCP client inspects, verifies, projects, or diagnoses the spoke
      Then mount_token, hall_token, and identity_token values must be omitted
      And a bounded mount_token_verdict may remain

    Scenario: Bead creation and claim cannot bypass lifecycle gates
      Given a caller supplies a duplicate bead id or a terminal initial status
      When cstar_bead creates or imports the bead
      Then the mutation must fail without overwriting the existing record
      And claim must always transition a non-terminal bead to IN_PROGRESS
      And terminal beads must reject claim

  Rule: Natural-language work becomes a small server-owned job

    Scenario: A valid request is queued without execution
      Given a caller supplies worker_kind, objective, workspace_ref, expected_artifacts, and idempotency_key
      And workspace_ref is a logical identifier rather than a filesystem path
      When cstar_start_worker_job accepts the request
      Then CStar must generate the job identifier
      And the job must be persisted in QUEUED state
      And the response status must be queued
      And deduplicated must be false
      And execution_available must be false
      And no worker, provider, model, profile, OAuth flow, credential, or command may be invoked

    Scenario: Callers cannot select execution internals
      Given a caller is preparing a Forge or Researcher work order
      When the public input and output schemas are inspected
      Then they must not expose provider, model, profile, OAuth, credential, command, lease token, storage reference, or path fields
      And worker_kind must allow only forge or researcher
      And profile selection must remain server-controlled

  Rule: Retry and cancellation behavior is deterministic

    Scenario: An identical idempotent retry returns the original job
      Given a repository already has a worker job for an idempotency key and canonical request
      And the original job may now be queued, cancelled, or terminal
      When the same key and canonical request are submitted again
      Then CStar must return the original job
      And the response status must be existing
      And deduplicated must be true
      And the original durable job state must remain unchanged
      And no second job or event may be created

    Scenario: Reusing an idempotency key for different work fails closed
      Given a repository already has a worker job for an idempotency key
      When the same key is submitted with a different canonical request fingerprint
      Then the call must fail with IDEMPOTENCY_CONFLICT
      And no second job or event may be created

    Scenario: Queued cancellation is immediate and repeatable
      Given a worker job is QUEUED
      When cstar_cancel_worker_job is called more than once
      Then the job must remain CANCELLED
      And only the first call may report changed as true
      And no worker or destructive cleanup may be invoked

    Scenario: Future active cancellation is a request rather than a fabricated success
      Given a future worker job is LEASED or RUNNING
      When cstar_cancel_worker_job is called
      Then the job must become CANCEL_REQUESTED
      And a repeated cancellation must be unchanged and idempotent
      And a terminal SUCCEEDED or FAILED job must not be rewritten as cancelled

  Rule: Reads expose bounded durable evidence

    Scenario: Job reads return the public projection only
      Given a persisted worker job exists
      When cstar_get_worker_job is called with its job_id
      Then the response status must be ok
      And execution_available must be false in the preliminary phase
      And internal leases, tokens, providers, models, profiles, credentials, commands, and paths must be omitted

    Scenario: Artifact reads use opaque delivery and fail closed when unavailable
      Given a caller supplies job_id and artifact_id
      When cstar_fetch_worker_artifact resolves a published artifact
      Then it may return bounded metadata and opaque delivery
      And it must never reveal a storage_ref or storage path
      But when the artifact is missing or unready
      Then it must return a structured error without inventing evidence

  Rule: Hosting does not collapse the local-worker boundary

    Scenario: The preliminary broker cannot execute local profiles
      Given the CStar Console is hosted on Sites
      And Forge and Researcher remain on a user-controlled local worker
      When ChatGPT queues a worker job through the thin MCP
      Then CStar Core may persist and display the job
      But Sites and the MCP handler must not execute the local profile
      And MiniMax and xPremium OAuth state must remain local
      And remote MCP hosting on Sites must remain conditional on a streaming and OAuth proof

    Scenario: Live workers remain blocked until identity and artifact integrity exist
      Given the preliminary broker has no authenticated job owner or registered worker identity
      When a deployment attempts to enable remote or live worker processing
      Then every job lookup must first enforce a server-derived subject and tenant
      And every lease must bind to an authenticated registered worker
      And every stored artifact must be verified by a server-owned storage adapter before READY
      And missing any gate must block the deployment

  Rule: Local profile recovery is metadata-first and fail-closed

    Scenario: The first intake pass inventories only versionable candidates
      Given Forge or Researcher exists on the user's local PC
      When the Hermes profile intake checklist is run
      Then it may inventory relative paths and metadata under approved source, prompt, schema, template, and test roots
      And it must not copy, archive, upload, commit, or print file contents
      And the Researcher code subtree may be inventoried without traversing sibling vault data

    Scenario: Sensitive local state is never an intake candidate
      Given a Hermes profile contains runtime and private state
      When a metadata-only manifest is prepared
      Then secrets, OAuth state, sessions, cookies, logs, transcripts, memories, raw vaults, and private data must be excluded
      And live configuration, cron state, databases, caches, backups, and generated artifacts must be excluded
      And excluded files must not be listed individually or hashed

    Scenario: Recovered source does not imply execution authority
      Given a sanitized Forge or Researcher source bundle is later approved
      When its manifest is accepted by CStar
      Then the preliminary broker must still report execution_available as false
      And worker registration, local enrollment, OAuth use, and live execution must remain separate gates
