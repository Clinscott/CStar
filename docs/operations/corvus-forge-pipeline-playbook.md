# Corvus Forge Pipeline Playbook

Corvus Forge is the CStar-governed pipeline for moving accepted Researcher/PPR
work into reviewed implementation packages without weakening operator gates.
This playbook is canonical for recall, request validation, PMT review, and
operator routing. It does not authorize live-fire dispatch by itself.

## Route

The standard route is:

`Researcher/PPR -> CStar bead -> GitHub issue -> PMT work branch -> Hermes MiniMax SwarmForge -> worker branch -> worker PR -> PMT review -> MM summary -> CoS decision`

Every step keeps the same CStar bead id, GitHub issue link, branch target,
validation evidence, and reviewer verdict. Work that cannot name those fields
is not ready for CoS decision.

## Authorized Dispatch Surface

This playbook and `docs/operations/corvus-forge-skill-spec.md` form the
authoritative Corvus Forge dispatch surface for `cstar_forge_request`.

The surface proves that a request can be represented as a CStar-controlled
Forge packet. It authorizes no-spend receipts and fail-closed routing only. It
does not authorize live Hermes, MiniMax, SwarmForge, Researcher, browser,
source-adapter, GitHub, or model-spend execution without a separate operator
authorization reference.

If this surface is missing, unreadable, outside the CStar project, or
insufficiently referenced by the request, `cstar_forge_request` must fail closed
instead of falling back to Codex workers, direct shell implementation, or direct
Hall/SQLite mutation.

## Authority Model

- CStar owns beads, acceptance criteria, lifecycle state, validation/result ids,
  exceptions, and closeout.
- GitHub is the issue, branch, PR, and review ledger.
- The PMT owns project integration, worker PR acceptance, work branch
  stewardship, review receipts, and final project packet to MM.
- Forge/Hermes/MiniMax workers produce bounded artifacts or worker PRs only
  after separate authorization.
- MM owns estate routing, sequencing, conflict routing, and upward summaries.
- CoS owns CEO-facing risk calls, yellow/red exceptions, and final approval
  routing.

## Request Packet Invariants

Every Forge dispatch request must include:

- CStar bead id or decision id.
- Owner PMT thread id and source callback thread id.
- Objective, prompt, scope, target paths, and system under test when relevant.
- Authority lane and escalation class.
- Required metrics with explicit acceptance thresholds.
- Expected artifacts, reports, package outputs, and callback packet name.
- Prohibited actions and requested actions.
- Spend policy, live-source policy, retry budget, and retry spent.
- Package/hash locks when supplied.
- PMT work branch, worker branch, and worker PR target branch when source work
  is involved; target must not be `main` or `master`.
- Explicit text: `Do not merge or push to main/master.`

## Required Metrics And Evidence

The minimum metrics are:

- `artifact_integrity`: receipt/package fields are complete and bounded.
- `contract_compliance`: bead, issue, branch, scope, authority lane, prohibited
  actions, and callback contract match the accepted packet.
- `validation_evidence`: local validation, CStar result ids, and witness
  receipts are present or explicitly gated.
- `safety_boundary`: live spend/source collection, secrets/config mutation,
  dirty-root mutation, and red-gate actions remain blocked.

The minimum evidence chain is:

- Dispatch packet.
- Request receipt from `cstar_forge_request`.
- Worker boot packet if live Forge work is later authorized.
- Worker receipt and artifact manifest.
- Local validation results.
- Worker PR and PMT review verdict when implementation occurs.
- MM summary and CoS decision packet.
- CStar result id and closeout status after acceptance.

## No-Spend Default And Fail-Closed Behavior

No-spend is the default. `cstar_forge_request` may record a dry-run request
receipt that proves the contract and authorized surface, but it must not run
Forge, Hermes, MiniMax, Researcher, source adapters, GitHub mutation, browser
collection, or model spend.

The receipt must show:

- `dispatch_execution.attempted=false`.
- `live_spend=false`.
- `live_source_collection=false`.
- `codex_worker_fallback_allowed=false`.
- `fail_closed_reason=no_live_dispatch_authority` unless live operator
  authorization is present and the surface is proven.

Missing metrics, missing callback contract, missing artifacts, missing
prohibited-action list, missing surface proof, or conflicting requested actions
stop before dispatch. Operators must not treat a dry-run receipt as worker
output.

`cstar_forge_execute` is the next gate after request proof. It must link to the
`cstar_forge_request` receipt, verify matching bead and decision fields, enforce
package/hash locks and retry policy, and then either return a no-op contract
proof, block live execution for an unknown adapter, or invoke the approved
adapter under the supplied operator authorization.

The execute gate must never use `cstar_autobot`, Codex workers, or ad hoc shell
implementation as a fallback. If no approved adapter is registered, the correct
result is a blocker such as `missing_authorized_execution_adapter`.

Approved adapter references are `cstar-forge-hermes-minimax-adapter` for
response-only evidence packets and `cstar-forge-hermes-minimax-worker-adapter`
for bounded file-manifest worker execution. A successful execution receipt
proves that the request, execute contract, adapter capability, and adapter
invocation lined up. The response-only adapter must block
build/package/source-mutation requests before spend with
`adapter_lacks_implementation_write_capability`. The worker adapter may write
only inside the sealed project/target roots. The adapter output is persisted under
`work/forge-executions/<execution_receipt_id>/adapter-response.json` and the
receipt must include response-artifact path/hash evidence. The persisted
adapter output must be an implementation-grade Forge execution packet with
`status`, `summary`, `files_changed` as an array, structured `artifacts`,
structured `validation`, structured `metrics`, structured `boundaries`, and
optional `callback_packet`. Success-like statuses must not claim changed files
or artifact paths that are missing from the bounded evidence roots.
Advisory-only packets such as `PASS-READY-FOR-PMT-REVIEW` and missing path
evidence fail closed as `adapter_degraded`; they are not implementation
evidence. Valid adapter output is evidence for PMT review, not automatic
acceptance; live Hermes/MiniMax invocation remains governed by the operator
authorization ref, PMT callback contract, receipt evidence, and this playbook.

The Hermes child receives safe-mode variables before startup and uses the
supported empty `context_engine` toolset. A headless Forge run never exposes
the interactive `clarify` tool.

## Live-Spend Authorization Requirements

Live Forge execution requires a separate operator authorization reference and a
current CStar bead/decision gate. The authorization must state the target
system, scope, spend/live-source policy, retry budget, metrics, artifact
expectations, callback packet, and prohibited actions.

Live execution remains blocked for:

- Merge/main publication, deploy/restart, branch protection change, broad PMT
  rollout, durable skill installation, or red-gate authority changes.
- Secret/config/token inspection, output, or mutation.
- Direct Hall/SQLite write.
- Dirty spoke-root mutation.
- Source adapter, Grok/X, RSS, browser, or GitHub mutation not explicitly
  authorized.
- Codex-worker fallback.

### Hermes compatibility preflight and failure evidence

Before a worker adapter can cross the model-call boundary, CStar runs the
sealed delegate in `--preflight` mode. The preflight may resolve and hash the
owner-controlled Hermes executable and run only `--version`, top-level
`--help`, and `chat --help`. It uses a temporary empty HOME/XDG tree, supplies
no prompt, profile, provider, model, credential, or source lane, and verifies
the exact flags used by the live command. A compatibility failure is
non-spending and final for that reserved one-shot request; it never starts
`hermes chat`.

Provider and model overrides are passed after the `chat` subcommand because
Hermes scopes those overrides to the chat parser. Placing them before `chat`
allows the subparser defaults to erase the requested identity.

After the model-call boundary, ambiguity remains conservative. A missing or
malformed delegate failure envelope records spend as unknown and consumes the
attempt. A valid nonzero delegate response may retain only the
`cstar.forge_delegate_failure.v1` whitelist: stable reason, provider, requested
and reported actual model identity, model-source evidence, Hermes profile,
spend/spend-unknown, and live-source status. Raw stdout, stderr, prompts, paths,
environment values, unknown keys, and arbitrary error text are never persisted.
Actual model identity remains null unless Hermes explicitly reports it.

A consumed receipt is never relaunched. Repair the blocker, validate and
activate the repair, then issue a fresh decision, request, attestation,
idempotency key, runtime seal, and one-shot grant.

## PMT Ownership And Callback Rules

The PMT remains accountable for the project package. A Forge worker receipt or
PR is evidence for PMT review, not PMT acceptance. PMT closeout must include
the bead id, issue link, branch and PR links, validation commands/results,
CStar result ids when available, changed-file scope, worker receipts, risks,
PMT verdict, MM summary, and CoS decision state.

Callbacks must be compact and decision-ready. Raw transcripts and large logs
belong in bounded artifacts or redacted evidence digests.

## Stop Conditions

Stop and escalate to MM/CoS when any of these occur:

- Missing bead id, decision id, callback thread, expected packet, metrics,
  artifact expectations, prohibited-action list, or dispatch surface proof.
- Requested action conflicts with prohibited actions.
- Live spend/source collection is requested without operator authorization.
- CStar MCP transport is unavailable and no degraded fallback is approved.
- Worker PR target is `main` or `master`.
- Exact-head drift, dirty-root mutation, duplicate branch/PR, or branch
  ownership conflict is detected.
- Secret/config mutation, deploy/restart, destructive cleanup, direct
  Hall/SQLite write, branch protection change, or main/master publication is
  requested.
- GitHub Actions failure is treated as authoritative without explicit opt-in.

## Closeout

Acceptance is not execution. Accepted work is executed only after separate
operator dispatch. Closeout must record validation/result evidence through
CStar where available and must not bypass into direct Hall/SQLite state.
