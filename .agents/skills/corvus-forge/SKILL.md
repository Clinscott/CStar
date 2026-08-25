---
name: corvus-forge
description: Route Corvus implementation, repair, refactoring, and build work through the durable CStar Forge request, execute, and independent-validation lifecycle. Use for any source-writing task, Forge live-fire, delivery manifest, worker callback, retry/spend decision, or Forge readiness review.
---

# Corvus Forge

Use the canonical lifecycle only:

`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> private Hermes cstar-hub -> requested minimax/MiniMax-M3 -> cstar_record_result`

Read `docs/operations/corvus-forge-pipeline-playbook.md` and
`docs/operations/corvus-forge-skill-spec.md` for packet and validation details.

- A request is no-spend. Authorize binds the exact current root-user challenge
  without provider spend. Execute consumes the authorized attempt.
- Preserve an unspent v2 receipt byte-for-byte. Reconcile only through its
  exact `v2-compat-v1` sidecar/challenge; atomically bind one verified
  reconciliation turn as requester lineage before authorization, never reissue
  it as v3, and never infer legacy prose as authority.
- Carry exact head, targets, required outputs, checker, evidence, retry/spend,
  dirty-root isolation, callback, and operator authorization in the packet.
- Treat adapter delivery as `delivered_unverified`. Only independent validation
  may complete the lifecycle.
- Record requested and actual worker identity separately; never infer an
  unreported model.
- Never substitute AutoBot, One Mind, Host Governor, Ravens, a Codex subagent,
  direct Hermes, shell generation, or a local worker for Forge.
- Preserve separate gates for installation, restart, commit, push, merge,
  deploy, secrets/configuration, locked holdout, and production claims.
- On missing lifecycle primitives, head drift, manifest drift, dirty overlap,
  or validation failure, fail closed and record the exact repair item.
