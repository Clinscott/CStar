Feature: State-only Codex-host Forge handoff
  Lore: A current v3 request may record one host-owned handoff, but the
  handoff is not cognition, provider, network, process, spend, or completion.

  Rule: Interrupted and later authorization state remains explicit

    Scenario: Interruption after request persistence
      Given a cstar.forge_request.v3 request was persisted as PENDING_AUTH
      And no host, provider, network, process, or spend attempt has started
      When the host resumes source inspection
      Then the v3 request remains the current request
      And requested_model and requested_reasoning remain gpt-5.6-luna and max
      And actual_identity remains unreported until host attestation exists

    Scenario: A later same-goal turn without fresh wording uses the durable request binding
      Given an unchanged pending request survived an interruption
      When the later root-user turn uses one exact unchanged-repair imperative form
      Then only the unchanged request-bound continuation path may authorize
      And the generic fresh-wording parser remains fail closed
      And no second request or attempt is created

    Scenario Outline: Exact imperative unchanged-repair forms remain narrowly affirmative
      Given an unchanged pending v3 root-repair request in the original root thread
      When a later root-user turn says "<text>"
      Then only the request-bound continuation path may authorize
      And no new request, attempt, provider request, or spend is created

      Examples:
        | text |
        | Continue the unchanged repair |
        | Continue with the unchanged repair. |
        | Resume the unchanged repair! |
        | Resume with the unchanged repair |
        | Proceed with the unchanged repair. |

    Scenario Outline: Broad aliases and scope-changing signals fail closed
      Given an unchanged pending v3 root-repair request in the original root thread
      When a later root-user turn says "<text>"
      Then continuation is rejected with <error_code>
      And no new request, attempt, provider request, or spend is created

      Examples:
        | text | error_code |
        | The host resumed the unchanged repair. | forge_root_repair_continuation_signal_invalid |
        | Continue the repair. | forge_root_repair_continuation_signal_invalid |
        | Inspect the README. | forge_root_repair_continuation_signal_invalid |
        | Continue and deploy it! | forge_root_repair_continuation_protected_action |
        | Continue with scope expansion. | forge_root_repair_continuation_protected_action |
        | Continue with a new target. | forge_root_repair_continuation_signal_invalid |
        | Continue with a different target. | forge_root_repair_continuation_signal_invalid |
        | Continue with a new scope. | forge_root_repair_continuation_signal_invalid |
        | Continue with the unchanged repair? | forge_root_repair_continuation_question |
        | Do not continue with the unchanged repair. | forge_root_repair_continuation_revoked |
        | Fork the repair. | forge_root_repair_continuation_revoked |
        | Switch to the other repair. | forge_root_repair_continuation_revoked |

    Scenario: A later revocation remains visible
      Given an exact Forge authorization or continuation is under review
      When a later user record revokes, stops, pauses, or withdraws Forge work
      Then the authorization is rejected as revoked
      And the handoff cannot be consumed as execution authority

  Rule: Handoff identity and scope are immutable

    Scenario: Thread mismatch cannot consume a bound authorization
      Given a request and authorization are bound to one operator thread and turn
      When another thread presents the same request reference
      Then the authorization lineage fails closed
      And no existing attempt is replayed for the other thread

    Scenario: Request, hash, target scope, or package lock drift fails closed
      Given a canonical request and host handoff are persisted
      When its request hash, handoff hash, target scope, ticket scope, or package lock changes
      Then the source contract rejects the drift
      And no fallback handoff or second provider attempt is created

    Scenario: Existing authorization or attempt cannot be replaced
      Given a durable authorization or attempt already binds the idempotency key
      When a conflicting authorization, attempt, or handoff is presented
      Then the source contract rejects the conflict
      And the original durable identity remains unchanged

  Rule: Post-return Codex-host consumption is a distinct fail-closed boundary

    Scenario: The active host consumes the exact returned v3 handoff
      Given CStar returned host_handoff_queued or host_handoff_replayed
      When the active Codex host invokes consume:forge-host-handoff with the exact returned binding
      Then the durable handoff is opened with no-follow descriptor checks
      And target and output path identities are revalidated immediately before the job is exposed
      And the receipt is ready_for_host_execution evidence only

    Scenario: A late target replacement blocks host job exposure
      Given a valid v3 handoff was returned and its target was later replaced by a symlink or hardlink
      When the active Codex host invokes the post-return consumer
      Then the consumer returns nonzero with forge_codex_host_path_identity_drift
      And no executable job is returned
      And no CStar lifecycle or validation-ticket mutation occurs

  Rule: Protected effects and compatibility remain bounded

    Scenario: Protected gates remain outside the host handoff
      Given a request asks for spend, live source, activation, restart, Git, secrets, deployment, or production
      When the bounded host contract is checked
      Then the request fails closed before a protected effect
      And the persisted host envelope reports zero provider requests and zero spend

    Scenario: Legacy v2 compatibility and v3 replay are explicit
      Given an immutable cstar.forge_request.v2 receipt or a valid v3 handoff
      When the compatibility or replay path is selected
      Then v2 remains a compatibility path and is not rewritten as v3
      And replay returns the same handoff identity without a second attempt

  Rule: Host-owned completion is bounded and remains independently validatable

    Scenario: A valid host completion is delivered without false spend or terminal success
      Given one existing STARTED v3 Codex-host attempt and its exact handoff job
      When the host submits matching execution, request, scope, handoff, job, and artifact hashes
      Then exactly one attempt records DELIVERED_PENDING_VALIDATION:<bounded receipt/status>
      And the attempt remains STARTED for independent validation
      And provider_requests_started, network_accessed, cognition_launch, and cstar_launch remain false or zero
      And the independent-validator ticket remains one-use and bound to the same attempt and scope

    Scenario: Exact host completion replay is deterministic and non-mutating
      Given a matching host completion was already recorded for the existing attempt
      When the same completion is submitted again
      Then every declared artifact is reopened and its actual bytes are reverified
      And the same completion fingerprint and delivery status are returned
      And no attempt, artifact manifest, spend flag, or validation ticket row changes

    Scenario: Host output coverage and actual artifact bytes are mandatory
      Given the exact host job declares one or more output_paths
      When the host submits its bounded artifact manifest
      Then every output_path appears exactly once with no target path or undeclared extra
      And each artifact is opened with O_NOFOLLOW after a pre-open lstat
      And its canonical real path equals the declared contained path before and after the read
      And fstat identity, regular-file ownership, nlink, size, actual byte count, and sha256 match
      And these checks complete before any delivery, spend, or validation-ticket mutation

    Scenario: Unsafe or stale host artifacts fail closed
      Given a matching completion or exact replay references host output artifacts
      When an artifact is missing, a directory, symlinked, hardlinked, replaced, changed, or hash-drifted
      Then completion or replay is rejected without changing any durable row
      And no provider, network, cognition, or CStar launch occurs

    Scenario Outline: Host completion drift and unsafe evidence fail closed
      Given a matching host completion is ready for the existing attempt
      When the host changes <field>
      Then completion is rejected without a second attempt or provider launch

      Examples:
        | field |
        | execution_receipt_id |
        | attempt_id |
        | request_sha256 |
        | scope_sha256 |
        | handoff_sha256 |
        | host_job_id |
        | artifact path outside project root |
        | high-volume artifact manifest |
        | secret-like payload |

    Scenario: UNKNOWN and terminal attempts cannot accept host completion
      Given the current attempt is UNKNOWN or non-STARTED terminal
      When the host submits a completion
      Then completion fails closed without replay, normalization, or ticket issuance
