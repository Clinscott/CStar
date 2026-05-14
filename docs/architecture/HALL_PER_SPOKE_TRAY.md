# Hall Schema Change — True Per-Spoke Tray

**Status:** PROPOSED (plan only, no code change)
**Author:** One Mind / kernel-mcp R3 follow-up
**Anchor Bead:** unallocated — register before execution.
**Related:** `bead:usb-sentry:001` (first spoke to exercise the existing spoke-anchored MCP surface).

---

## 1. Problem

Today every Hall record belongs to a single `repo_id` per estate. When a mounted spoke (e.g. `securesphere`) submits a bead via `cstar_bead create { spoke }` or `cstar_spoke_bead_import`, the bead's `repo_id` resolves to the **parent estate's** repo_id (the CStar kernel root), because `hall_mounted_spokes.repo_id` was modeled as the *containing estate's* identifier — not the spoke's own.

Consequence:
- All spoke beads land in one shared tray indexed by the estate's `repo_id`.
- Spoke identity survives only in `metadata.spoke_slug` (which I just added) — not in an indexed column.
- Listing "the bead tray for SecureSphere" requires a full table scan filtering by `metadata.spoke_slug`.
- Per-spoke baseline Gungnir scores, intent integrity, persona, status — concepts that already exist on `hall_repositories` — cannot be tracked per spoke.

The user's request is to make spoke trays *first-class*: each registered spoke owns its own `hall_repositories` row, its own bead tray, its own scan history, its own baseline scores.

---

## 2. End state

```
hall_repositories
├── repo:/home/morderith/Corvus/CStar              ← parent estate (kernel)
├── repo:/home/morderith/Corvus/SecureSphere       ← NEW: spoke-owned
├── repo:/home/morderith/Corvus/NexplayNexus       ← NEW
├── repo:/home/morderith/Corvus/Taliesin           ← NEW
├── repo:/home/morderith/Corvus/XO                 ← NEW
└── repo:/home/morderith/Corvus/agent-browser      ← NEW

hall_mounted_spokes
└── (parent_repo_id, spoke_repo_id, slug, ...)     ← schema delta
```

A bead landed via the spoke MCP surface anchors to the *spoke's* `repo_id`. The parent estate's tray contains kernel-internal beads only.

---

## 3. Schema delta

### 3.1 `hall_mounted_spokes`

Rename and split the `repo_id` column:

| Current | New | Purpose |
|---|---|---|
| `repo_id` (parent estate) | `parent_repo_id` | The estate that mounted this spoke. |
| — | `spoke_repo_id` | The spoke's *own* `hall_repositories` row (newly materialized). |

Migration (write-side):
- Add `spoke_repo_id TEXT` column (nullable during migration).
- Rename existing `repo_id` → `parent_repo_id` *or* introduce `parent_repo_id` as an alias view to keep old read paths working. Recommendation: add `parent_repo_id`, deprecate `repo_id`, drop in a later cycle.

Backfill:
- For each existing spoke row, compute `spoke_repo_id = buildHallRepositoryId(spoke.root_path)` and `INSERT OR IGNORE INTO hall_repositories` with a stub row (status `DORMANT`, baseline_gungnir_score 0, intent_integrity 0, name = slug).

### 3.2 `hall_beads`

No column changes. The semantic change is in which `repo_id` is written:
- Kernel-initiated beads → parent estate `repo_id` (unchanged).
- Spoke-initiated beads (via `cstar_bead create { spoke }` or `cstar_spoke_bead_import`) → spoke's `spoke_repo_id`.

Existing beads anchored to the parent estate but stamped with `metadata.spoke_slug` (everything created since the spoke-anchored MCP surface landed, including `bead:usb-sentry:001`) need a one-time backfill:
- For each `hall_bead` row with `metadata.spoke_slug` set, look up the spoke, re-anchor `repo_id` to `spoke_repo_id`, and emit an audit row in a new `hall_bead_anchor_migrations` table (so the re-anchor is reversible).

### 3.3 `hall_repositories` (no shape change, semantic addition)

Spoke-owned rows are real `hall_repositories` entries. Implications:
- `baseline_gungnir_score` and `intent_integrity` are tracked per spoke.
- `active_persona` may differ per spoke (e.g. SecureSphere on ALFRED while Taliesin on ODIN).
- `status` (DORMANT / AWAKE / AGENT_LOOP) becomes per-spoke. The kernel's own status is decoupled from any single spoke's status.

### 3.4 FTS5 and indices

- Confirm whether `hall_beads_fts` / `hall_engrams_fts` indexes `repo_id`. If yes, rebuild after backfill.
- Add `CREATE INDEX hall_beads_repo_status ON hall_beads(repo_id, status)` if not present — per-spoke list-by-status becomes a hot path.

### 3.5 Foreign keys

- `hall_beads.repo_id` already FKs to `hall_repositories.repo_id`. Newly materialized spoke rows satisfy this automatically.
- Any tables that FK on `hall_mounted_spokes.repo_id` (rare — likely none) must be updated to `parent_repo_id`.

---

## 4. MCP surface delta

All additive. Existing callers without `spoke` keep current behavior.

### 4.1 `cstar_bead`

- `list` action: accept optional `spoke` arg. When set, scope to `spoke_repo_id`. When absent, scope to the kernel's `repo_id` (current behavior).
- `get` / `update_status` / `claim` / `resolve` / `block`: unchanged (lookup by globally-unique `bead_id`).

### 4.2 New `cstar_spoke_tray`

Returns the per-spoke tray summary:

```jsonc
{
  "spoke": "securesphere",
  "repo_id": "repo:/home/morderith/Corvus/SecureSphere",
  "trust_level": "trusted",
  "write_policy": "read_write",
  "mount_status": "active",
  "bead_counts": { "OPEN": 1, "IN_PROGRESS": 0, "BLOCKED": 0, "RESOLVED": 0 },
  "baseline_gungnir_score": 0,
  "intent_integrity": 0,
  "last_scan_at": null,
  "recent_beads": [ /* compactBead × 5 */ ]
}
```

### 4.3 `cstar_hall_search`

Accept optional `spoke` arg to scope the search to that spoke's `repo_id`. Without it, search remains estate-wide (current behavior).

### 4.4 `cstar_doctor`

Add a `spokes` block to the doctor payload: per-spoke `mount_status`, `trust_level`, `write_policy`, `bead_count`, `last_health_at`. Operator gets a one-glance estate readout.

---

## 5. CLI delta

- `./cstar spoke list` shows per-spoke bead counts and trust/policy at a glance.
- `./cstar spoke tray <slug>` mirrors `cstar_spoke_tray` for terminal use.
- `./cstar spoke link` gains `--accept-beads` shortcut that bundles `--trust trusted --write-policy read_write`. The default `--write-policy` stays `read_only` to preserve the safe default.
- `./cstar hall <query>` accepts optional `--spoke <slug>` to scope FTS.

---

## 6. Migration plan (phased, reversible)

**Phase 0 — Read-only inventory** (no writes)
- New script `scripts/hall/per-spoke-tray-dryrun.mjs` reports: each spoke, what its `spoke_repo_id` *would* be, count of existing beads with `metadata.spoke_slug` that would re-anchor. No mutation.

**Phase 1 — Materialize spoke repos**
- Migration SQL: add `parent_repo_id`, `spoke_repo_id` columns.
- One-shot: for each spoke, `INSERT OR IGNORE INTO hall_repositories` with a stub row.
- Backfill `hall_mounted_spokes.spoke_repo_id` from `buildHallRepositoryId(root_path)`.
- Bead anchoring unchanged at this phase — the new column exists but isn't consulted yet.

**Phase 2 — Re-anchor existing spoke beads**
- New table `hall_bead_anchor_migrations(bead_id, from_repo_id, to_repo_id, migrated_at, dry_run)`.
- Script runs in dry-run first, then commit. Each row a reversal pointer.

**Phase 3 — Switch the writer**
- `resolveSpokeAnchor` returns `spoke.spoke_repo_id` instead of `spoke.repo_id`.
- New beads from spokes land in the spoke tray automatically.
- Code change is one line in `cstar-kernel-mcp.ts`; gate behind a registry flag `hall.per_spoke_tray_enabled` for first 24 hours.

**Phase 4 — Surface deltas (MCP + CLI)**
- Ship `cstar_spoke_tray`, `cstar_bead list { spoke }`, `cstar_hall_search { spoke }`, `cstar spoke tray <slug>`, `cstar spoke list` enrichment.

**Phase 5 — Deprecate the legacy column**
- After one verified migration cycle in production, drop the old `repo_id` column on `hall_mounted_spokes` (keep `parent_repo_id` + `spoke_repo_id`).

Reverse path at any phase: re-anchor by reading `hall_bead_anchor_migrations` in reverse; legacy column is preserved through Phase 4.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| FTS5 index reuses `repo_id` and silently splits historical search results between estate and spoke trays. | High | Phase 0 audit must enumerate every FTS table touching `repo_id`. Rebuild as part of Phase 2. |
| Code paths assume one `repo_id` per session (e.g. `resolveActiveRepo`). After re-anchor, they fetch the kernel tray and miss spoke beads. | Medium | Grep for `resolveActiveRepo` / `registry.getRoot` and audit every call site that queries beads. List in Phase 0 report. |
| `hall_repositories.baseline_gungnir_score` and `intent_integrity` start at 0 for newly-materialized spoke rows. Wardens (Norn/Heimdall/Freya) may report regressions on the first scan. | Low | Treat first scan after materialization as the baseline; suppress regression alerts during the "first-scan" grace window via a `metadata.first_scan_after_tray_split = true` flag. |
| Operator forgets `--write-policy read_write` and the spoke can't accept beads. | Low | `--accept-beads` shortcut + improved help text. Hard error message from `resolveSpokeAnchor` already names the policy. |
| Anchor migration races a concurrent bead create. | Low | Run Phase 2 with a 60s estate-wide write lock (existing `state_registry` lock surface). |

---

## 8. Sterling Mandate

- **Lore:** `tests/features/hall_per_spoke_tray.feature` — scenarios for spoke-anchored creates, per-spoke list scoping, doctor enrichment, migration dry-run, reverse-migration.
- **Isolation:** unit tests around the schema migration script, `cstar_spoke_tray`, and the `cstar_bead list { spoke }` filter — co-located in `tests/unit/test_hall_per_spoke_tray.test.ts`.
- **Audit:** Gungnir run on the integration PR. Wardens to attend: Norn (test coverage on the migration), Ghost (FK boundary at `hall_beads.repo_id`), Heimdall (no warden firings on first-scan-after-split), Mimir (FTS rebuild produces no zero-result regressions on existing queries).

---

## 9. Out of scope (deferred)

- Per-spoke active personas (the model supports it; ritual / `cstar persona` will need a `--spoke` flag).
- Federated trays across estates (multiple CStar installations sharing a Hall surface) — separate doc.
- Cross-spoke bead linkage (e.g. a SecureSphere bead blocked by a CorvusEye bead) — single line of `metadata.blocked_by` works today, but a real `hall_bead_links` table is a follow-up.

---

## 10. Open questions

1. Should `cstar_spoke_bead_import` continue to require Lore (`.feature`) at submission, given that spokes early in onboarding may not have a tests directory? Lean: keep the gate; soft-onboarding lives behind a `--allow-loreless` flag if at all.
2. Does `repo:<root_path>` collide if two estates mount the same spoke at the same path? Unlikely on a single host, but worth a primary-key sanity check.
3. Should the spoke-repo row inherit the estate's `active_persona` at materialization, or default to `ALFRED`? Lean: inherit, then operator can change.