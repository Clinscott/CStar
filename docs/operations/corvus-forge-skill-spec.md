# Corvus Forge Skill Spec

Corvus Forge is a recallable operating wrapper for CStar-governed build,
repair, package, and review work. It is not the execution engine and it does
not replace CStar beads, GitHub issue/branch/PR review, PMT review, MM summary,
or CoS decision gates.

## Authorized Dispatch Surface

This document, together with
`docs/operations/corvus-forge-pipeline-playbook.md`, is the authoritative
Corvus Forge dispatch surface that `cstar_forge_request` may prove before it
returns a dispatch-ready receipt.

The surface authorizes only contract validation, routing proof, no-spend dry
run receipts, and callback packaging. It does not authorize live Hermes,
MiniMax, SwarmForge, Researcher, browser, GitHub, source-adapter, or model
spend execution by itself.

`cstar_forge_request` must fail closed when this surface is absent or when a
request omits required contract fields. It must never substitute a Codex worker,
ad hoc shell command, direct Hall/SQLite write, or unreviewed chat handoff for
Corvus Forge.

## Dispatch Authority Contract

Every Forge dispatch request must provide:

- CStar bead id or explicit decision id.
- Owner PMT thread id and source callback thread id.
- Objective, prompt or work statement, target paths, and system under test when
  relevant.
- Scope and authority lane: `green`, `yellow`, or `red`.
- Required metrics with acceptance thresholds.
- Artifact, report, package, and callback expectations.
- Prohibited actions and requested actions.
- Spend, live-source, and retry policy.
- Callback contract with expected packet name and callback destination.
- Package or artifact hash locks when supplied.

The PMT remains the project owner and final integrator. Forge/Hermes/MiniMax
workers, when separately authorized, produce bounded worker artifacts or worker
PRs for PMT review. They do not merge, publish, deploy, restart, mutate
secrets/config, close CStar lifecycle state, or bypass PMT/MM/CoS gates.

## Required Metrics Schema

Metrics are mandatory. Each metric must include a stable `name` and explicit
`threshold`. Recommended metric classes:

- `artifact_integrity`: required files, manifests, hashes, and receipt fields
  are present.
- `contract_compliance`: bead, issue, branch, target, authority lane, and
  callback fields match the accepted packet.
- `validation_evidence`: local checks, CStar result ids, and witness receipts
  satisfy the task gate.
- `safety_boundary`: prohibited actions, live-source limits, no-main/no-master,
  and dirty-root isolation are preserved.
- `quality_bar`: output is usable for PMT review without stale lifecycle claims,
  unverified finalizer assertions, or hidden model/source spend.

Requests with no metrics or missing thresholds are rejected before any dispatch
surface proof can be treated as usable.

## Artifact And Callback Contract

A Forge dispatch packet must declare the artifacts expected from the worker or
dry-run receipt. Acceptable artifacts include:

- Dispatch receipt.
- Worker boot packet.
- Worker receipt.
- Artifact manifest or generated manifest sidecar.
- Local validation transcript or summary.
- Worker PR link when live worker execution is separately authorized.
- PMT review packet.
- MM summary packet.
- CoS decision packet.

Callbacks must name the expected packet and callback thread. Large logs should
be packaged as bounded artifacts or digests; callbacks should carry the receipt
id, changed-file scope, validation commands/results, CStar result ids when
available, residual risk, and next gate.

## Prohibited Actions Enforcement

The request must list prohibited actions. The following are prohibited by
default unless the operator separately authorizes the exact action:

- Live Researcher, Forge, Hermes, MiniMax, browser, source-adapter, GitHub, RSS,
  Grok/X, or model spend.
- Merge, main/master publication, deploy, restart, branch protection change, or
  broad PMT rollout.
- Secret/config/token inspection, output, or mutation.
- Destructive cleanup, reset, stash, deletion, checkout-over, or history
  rewrite.
- Direct Hall/SQLite write or CStar lifecycle bypass.
- Dirty spoke-root mutation.
- Codex-worker fallback or ad hoc shell execution as implementation.

If requested actions conflict with prohibited actions or red-gate patterns, the
request is rejected. If live spend is requested without operator authorization,
the receipt remains `dry_run_no_spend` with fail-closed semantics.

## No-Spend And Live-Spend Semantics

The default mode is no spend. In no-spend or dry-run mode,
`cstar_forge_request` may return a receipt proving that the contract is complete
and this authorized surface exists, but `dispatch_execution.attempted` remains
`false`, `live_spend` remains `false`, `live_source_collection` remains `false`,
and `codex_worker_fallback_allowed` remains `false`.

Live Forge execution requires all of the following:

- Operator authorization reference in the spend policy.
- Accepted CStar bead or decision id.
- Current PMT owner and callback thread.
- Complete required metrics and artifact expectations.
- Explicit prohibited-action list.
- Exact branch/PR/target and validation gates when source work is involved.
- PMT/MM/CoS approval for any yellow/red action.

Even when live authorization exists, execution must occur only through the
authorized Corvus Forge/Hermes/MiniMax dispatch surface. The MCP request
primitive returns a compact receipt; the execution primitive consumes that
receipt and may invoke the approved adapter only after the contract is proven.

For the write-capable worker, sealed adapter preparation includes a
non-spending Hermes compatibility preflight. The only permitted child commands
are the exact executable with `--version`, `--help`, and `chat --help` under a
sterile temporary HOME/XDG environment. The probe proves the CLI flags used by
the live delegate and emits only `cstar.forge_hermes_preflight.v1` hashes and
pass/fail fields. It receives no prompt, profile, provider, model, credential,
or live-source authority. Preflight failure closes the reserved attempt as
non-spending `FAILED_FINAL` before adapter/model start.

The Hermes child receives safe-mode variables before startup and uses the
supported empty `context_engine` toolset, so a headless worker cannot block on
the interactive `clarify` callback.

The live invocation places `--provider` and `--model` after `chat`; Hermes'
chat-subparser defaults otherwise overwrite top-level values with nulls.

Once the delegate may have invoked `hermes chat`, missing spend evidence is
`UNKNOWN`, never assumed false. Nonzero delegate output is accepted as failure
evidence only after the worker reduces it to the
`cstar.forge_delegate_failure.v1` whitelist. The control plane discards raw
stdout/stderr, prompt and environment content, paths, unknown fields, and
unbounded error strings. Requested and actual model fields are separate;
actual identity is null unless the runtime reports it. Retrying requires a new
decision and request rather than reuse of the consumed receipt.

## Execution Primitive Contract

`cstar_forge_execute` is the dedicated execution-gate primitive. It consumes or
references a `cstar_forge_request` receipt and revalidates the bead, decision,
owner PMT thread, callback thread, required metrics, artifact expectations,
prohibited actions, package/hash locks, retry policy, and spend policy before
any execution can be considered.

No-op mode is allowed for contract proof only. It must return a receipt showing
no live spend, no live source collection, no adapter invocation, and no
Codex-worker fallback.

Live-authorized mode requires an explicit operator authorization reference and
a registered Forge/Hermes/MiniMax execution adapter. Approved adapter
references are `cstar-forge-hermes-minimax-adapter` for response-only evidence
packets and `cstar-forge-hermes-minimax-worker-adapter` for bounded file-manifest
worker execution. Both are backed by this spec and the pipeline playbook, and
both explicitly forbid Codex-worker fallback.

If the adapter is missing, unapproved, or not registered, `cstar_forge_execute`
must fail closed with a machine-readable blocker instead of calling
`cstar_autobot`, a Codex worker, or an ad hoc shell command. If the adapter is
registered and live authorization is supplied, the execution primitive invokes
the adapter through the sealed Forge intent packet. The adapter result is
reported as execution evidence. The response-only adapter may write the adapter
response artifact, cost ledger, and lock only. It must fail closed with
`adapter_lacks_implementation_write_capability` for build/package/source-mutation
requests. The worker adapter must validate a strict file manifest, keep all
writes inside the sealed project/target roots, and then emit the same execution
packet contract. Live adapter output must be captured as a
durable response artifact with path, bytes, and sha256 in the execution receipt;
the response must carry the Forge execution packet fields `status`, `summary`,
`files_changed` as an array, structured `artifacts`, structured `validation`,
structured `metrics`, structured `boundaries`, and optional `callback_packet`.
Success-like statuses must not claim changed files or artifact paths that are
missing from the bounded evidence roots. Missing path evidence and advisory-only
PMT-review packets fail closed as `adapter_degraded`.
PMT review and the callback contract remain required before any acceptance
claim.

The execution primitive must reject mismatched request receipt linkage,
mismatched bead or decision ids, conflicting requested/prohibited actions,
missing metrics, missing callback contract, inconsistent package locks, and
retry-policy violations.

## Operating Rules

- Preserve route:
  `Researcher/PPR -> CStar bead -> GitHub issue -> PMT work branch -> Hermes MiniMax SwarmForge -> worker branch -> worker PR -> PMT review -> MM summary -> CoS decision`.
- Require packaging mode: `PR_REQUIRED`,
  `LOCAL_EXCEPTION_WITH_FOLLOWUP_PR`, or `NO_GITHUB_DOCS_ONLY`.
- Treat GitHub Actions as advisory/non-blocking unless a repo explicitly opts
  into them.
- Use PMT local validation, CStar result ids, and CStar Console witness receipts
  as primary validation evidence.
- Require exact-head validation and dirty-root isolation.
- Require branch ownership locks and no worker PR target to `main` or `master`.
- Preserve ENV_GATED handling for MongoDB, secrets, config, host-sync, or other
  live-system checks.

## Installation Posture

Do not install or treat Corvus Forge as a durable hidden dispatcher from this
document alone. Durable skill installation, live dispatch, and broad PMT rollout
require separate CoS/user approval after docs/runtime surfaces and non-live
proofs are accepted.
