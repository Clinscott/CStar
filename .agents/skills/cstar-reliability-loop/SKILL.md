---
name: cstar-reliability-loop
description: Coordinate bounded validation, automatic repair beads, and independent acceptance for CStar work.
tier: SKILL
risk: medium
intent_category: VERIFY
entry_surface: host-only
terminal_required: false
---

# CStar Reliability Loop v1

CStar is the state manager and canonical receipt authority. CoS is the
operator-facing orchestrator. The authorized Forge implementation and repair
lane owns implementation work; a distinct independent validator owns
acceptance. Model selector and role are separate, and actual identity is
`unreported` unless the host explicitly attests otherwise. The kernel never spawns a
model, dispatches a worker, edits a file, or creates a repair bead from
`cstar_record_result`.

After an independent result is recorded, inspect
`response.reliability_continuation`:

- `accepted` means authoritative validation and every required proof passed.
- `working` means a verified runner receipt reports bounded SPRT trials still
  available. Run only the remaining bounded trials and obtain a fresh
  independent result.
- `repairing` means durable metadata explicitly enabled automatic repair and
  the returned `repair_bead_create_draft` is safe to materialize.
- `operator_decision_required` means an operator decision, a protected gate,
  missing authority, or a non-automatic repair is required.

For `repairing`, immediately materialize the exact draft with `cstar_bead`
using `action=create` and map its `repository_binding.repo_id` to the
repository/spoke argument supported by that tool; the draft is not itself a
`cstar_bead` argument object. Claim the resulting bead through the authorized
Forge implementation route,
keep the parent bead open, and run the focused checker named by the bead. A
distinct independent validator must inspect the changed target and call
`cstar_record_result`; delivery and worker claims are not acceptance.

Risk is the maximum of durable `reliability_risk_tier` metadata and the
deterministic target classification. Kernel, PennyOne, Hall, transport,
runtime, validation, and control-plane paths are critical. Other source and
script paths are elevated. Documentation, tests, and skills are routine unless
metadata escalates them. Routine work does not run SPRT. Elevated work uses
bounded focused checks and escalates to the runner policy when metadata or
scope requires it. Critical positive results require a hash-bound
`cstar.workflow_sprt_autoresearcher.v1` receipt in the independent manifest.
Its Gungnir section is heuristic evidence only and never validation authority.

The loop is additive to legacy result inputs and does not add an MCP tool.
Keep evidence bounded: persist hashes, scores, denominators, verdicts, and
continuation state; keep transcripts and high-volume runner output outside
Hall. `authority_effect` is always `process_only`. No hidden write, provider
dispatch, model spawn, retry, spend, source expansion, or protected/external
action is implied by a continuation. Protected and external decisions remain
operator gates. Report only concise statuses: `working`, `repairing`,
`accepted`, or `operator_decision_required`.
