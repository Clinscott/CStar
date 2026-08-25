---
name: corvus-forge
description: Route Corvus implementation, repair, refactoring, and build work through the durable CStar Forge request -> authorize -> execute -> independent record_result lifecycle. Use for any source-writing task, Forge live-fire, delivery manifest, worker callback, retry/spend decision, or Forge readiness review.
---

# Corvus Forge

Use the canonical lifecycle only:

`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> Codex-host state-only handoff -> DELIVERED_PENDING_VALIDATION -> independent cstar_record_result -> CoS closeout`

Current Forge v3 persists or queues a Codex-host handoff with
`runner_owner: "codex-host"`, requested `gpt-5.6-luna`/`max`, and a distinct
host-attested actual identity. Use `unreported` in operator prose and `null` in
structured records when the host provides no attestation. The handoff has
`host_launch_required: true` and performs no provider, cognition, or CStar
launch at handoff. Private Hermes `cstar-hub` / MiniMax-M3 is an explicitly
selected legacy v2 compatibility lane, not the current default route.

After `cstar_forge_execute` returns `host_handoff_queued` or
`host_handoff_replayed`, the active Codex host must retain the exact returned
handoff/request/attempt/scope fields and run the post-return consumer before
exposing executable job data:

```text
npm run consume:forge-host-handoff -- \
  --handoff-path <returned host_handoff.handoff_path> \
  --handoff-sha256 <returned host_handoff.handoff_sha256> \
  --request-id <returned forge_request_receipt_id> \
  --request-sha256 <returned worker_job.canonical_request_sha256> \
  --execution-receipt-id <returned execution_receipt_id> \
  --attempt-id <returned attempt_id> \
  --scope-sha256 <returned worker_job.target_paths_sha256>
```

The command reads the exact durable file with no-follow descriptor checks,
validates its owner-only type/mode/link count and hashes, compares the trusted
return binding, and revalidates target/output path identities immediately before
returning `ready_for_host_execution`. It performs no provider, cognition, CStar,
Hall/SQLite, validation-ticket, cleanup, or lifecycle action. A blocked result
contains no executable job. This narrows the replacement window but cannot make
the filesystem atomic across the final check and a later host open/execute;
that sequential TOCTOU boundary remains explicit.

Read `docs/operations/corvus-forge-pipeline-playbook.md` and
`docs/operations/corvus-forge-skill-spec.md` for packet and validation details.

- A request is no-spend. Codex fills the machine contract from the accepted
  bead/proposal; the operator gives a normal build, implement, repair, fix, or
  route-to-Forge instruction with one exact work reference. Authorize binds
  that root-user turn without provider spend. Current v3 execute reserves the
  state-only handoff without provider or cognition launch; an explicitly
  selected legacy adapter consumes its own bounded provider attempt.
- Preserve an unspent v2 receipt byte-for-byte. Reconcile only through its
  internal `v2-compat-v1` sidecar/challenge; never expose that compatibility
  token as the normal operator UX, reissue v2 as v3, or infer legacy prose as
  authority.
- Carry exact head, targets, required outputs, checker, evidence, retry/spend,
  dirty-root isolation, callback, and operator authorization in the packet.
- Treat adapter delivery as `delivered_unverified`. Only independent validation
  may complete the lifecycle.
- Record the requested selector and host-attested actual identity separately;
  use `unreported`/`null` when the host provides no attestation. Never infer an
  actual model from a provider, role, or task name.
- Never substitute AutoBot, One Mind, Host Governor, Ravens, a Codex subagent,
  direct Hermes, shell generation, or a local worker for Forge.
- Preserve separate gates for installation, restart, commit, push, merge,
  deploy, secrets/configuration, locked holdout, and production claims.
- On missing lifecycle primitives, head drift, manifest drift, dirty overlap,
  or validation failure, fail closed and record the exact repair item.
