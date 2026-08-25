# Augury SET Mission-Boundary Receipt

Status: Accepted for phase 1 contract and read-side projection

Receipt schema: `cstar.augury_mission_receipt.v1`

Boundary input schema: `cstar.augury_mission_boundary.v1`

## Decision

At a newly SET mission or design/workflow boundary, Augury may project one
typed deterministic mission receipt and its complete ordered bead plan.
Projection is read-only. It does not create, claim, update, or authorize beads,
and it does not grant execution, spend, mutation, validation, or lifecycle
authority.

This decision supersedes only the PR40-reconciliation rejection of
**mandatory mission-boundary Augury** in
`docs/reports/cstar-pr40-reconciliation-20260730.md`. It does not supersede any
other rejected PR40 behavior. In particular, the ban on Augury-before-every-
response, per-turn, per-edit, or generic trace rituals remains in force.
Ordinary child repair and validation iterations inside an unchanged accepted
mission design do not require a new Augury receipt.

Phase 1 defines the typed builder, replay verifier, and `handleAugury`
projection. It does not change the public tool catalog, registration,
packaging, generated artifacts, Hall state, or Forge mission-grant,
reservation, provider-start, or controller paths.

## Exact SET boundary

Mission-boundary mode accepts only
`cstar.codex_exact_root_set_identity.v1` with
`verification=exact_root_user_set`, one canonical root-user record, and exact
thread id, turn id, SET record SHA-256, and ordered turn record-set SHA-256.
The identity is a projection of the existing exact SET reader semantics; it is
not a new natural-language authority parser.

Questions, quotations, examples, conditionals, negations, and revocations do
not satisfy this profile. Callers must first obtain the verified identity from
the existing exact SET path. Augury neither scans prose for a permissive
approximation nor upgrades the receipt into authority.

## Canonical payload

The receipt binds:

- schema, version, read-only authority effect, and new-boundary kind;
- exact root SET identity;
- repository id, canonical repository root, and root-identity hash;
- mission decision id and proposed parent bead id;
- design revision and design SHA-256;
- whitespace-normalized scope;
- the complete ordered set of canonical contained target paths;
- deterministic Council intent category, tier, selection, expert, candidates,
  and guardrails from the existing Augury route;
- the complete topologically ordered bead plan, including each bead id,
  dependencies, lane, contained targets, acceptance obligations, and checker
  obligations;
- exact target, bead, dependency, acceptance, and checker counts.

Every input array and every aggregate plan count is bounded at 64. Over-limit
input is rejected before payload hashing. The implementation never slices,
persists, or hashes a truncated target set or plan. Every contained target must
appear in at least one planned bead, every planned target must be contained by
the repository boundary, and dependencies may name only the proposed parent
or an earlier planned bead.

Canonical JSON recursively sorts object keys while preserving array order.
`canonical_payload_sha256` hashes the complete canonical payload.
`receipt_id` is a domain-separated SHA-256 binding to that payload hash. Exact
input replay therefore produces byte-identical canonical receipt JSON. When a
prior payload hash and receipt id are supplied as a replay binding, any changed
SET record, ordered record set, repository/root identity, scope, target,
design, Council projection, or plan fails closed.

## Failure codes

The phase 1 contract emits these exact codes:

- `augury_mission_boundary_incomplete` — missing, extra, or wrong boundary
  schema fields.
- `augury_mission_set_identity_invalid` — non-exact, malformed, multi-record,
  or non-root-SET identity.
- `augury_mission_repository_identity_invalid` — malformed repository id or
  non-canonical absolute root.
- `augury_mission_root_mismatch` — supplied repository root differs from the
  Augury runtime root.
- `augury_mission_decision_id_invalid` — malformed mission decision id.
- `augury_mission_parent_bead_id_invalid` — malformed proposed parent bead id.
- `augury_mission_design_invalid` — invalid design revision or SHA-256.
- `augury_mission_scope_invalid` — empty, unbounded, or control-bearing scope.
- `augury_mission_target_paths_invalid` — empty, duplicate, malformed, or
  over-limit ordered target set.
- `augury_mission_target_outside_root` — a target resolves to or outside the
  bound repository root.
- `augury_mission_council_invalid` — incomplete or malformed deterministic
  Council projection.
- `augury_mission_plan_invalid` — malformed, duplicate, or incomplete plan
  item shape.
- `augury_mission_plan_limit_exceeded` — bead or aggregate plan count exceeds
  64.
- `augury_mission_plan_dependency_invalid` — dependency is neither the
  proposed parent nor an earlier planned bead.
- `augury_mission_plan_target_invalid` — a planned target is not in the
  contained target set.
- `augury_mission_plan_incomplete` — at least one contained target is absent
  from all planned beads.
- `augury_mission_replay_mismatch` — supplied replay hash/id does not match the
  complete newly canonicalized payload.

Mission-boundary failures are returned by Augury as both `error_code` and
`error`, with `isError=true`. Legacy advisory failures retain their existing
response compatibility.

## Migration policy

Existing active legacy manifests remain replay and closeout compatible. They
are not retroactively invalidated, rehashed, rewritten, or required to acquire
an Augury mission receipt.

New mission-boundary materialization will, in a later gated phase, require a
valid `cstar.augury_mission_receipt.v1` bound to the exact new SET/design
boundary. Until that materialization phase lands, this receipt is visible
read-side evidence only and is not persisted by Augury. A later materializer
must verify the complete receipt and replay binding; it must not rebuild,
truncate, infer, or silently repair the plan.
