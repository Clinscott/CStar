# P1 Code Review Pipeline — CStar Bead

**Bead ID:** bead:chant-session:p1-scan-pipeline
**Status:** OPEN
**Rationale:** Design a P1_SCAN pipeline using CStar bead system where Gemma reviews one file per bead context to avoid local model context limits, with findings stored per-file in `.stats/` and aggregated into a per-spoke master report, culminating in a God file synthesized by Hermes.

---

## Problem Statement

Gemma (local model, 8GB VRAM) hits context limits when scanning multiple files in a single context. The current approach of passing multiple files to Gemma simultaneously produces shallow, inconsistent reviews and risks context truncation.

**The actual goals:**
1. Gemma focuses on one file at a time — deep focus, no context pressure
2. Each file's review is a discrete, auditable unit of work (a bead)
3. Findings are stored in `.stats/` (per-file) and a master report (per-spoke)
4. Hermes synthesizes the God file at the end
5. Everything queryable via the Hall

---

## Pipeline Architecture

### 1. Hermes Cron — Creates Scan Beads

Trigger: Manual or cron (`hermes cron`)

Hermes discovers source files in the target spoke, then creates one P1_SCAN bead per file using `BeadLedger.upsert_bead()`:

```
scan_id:     <P1_SCAN scan ID>
target_kind: FILE
target_path: /absolute/path/to/spoke/folder/file.ext
rationale:   P1 Code Review Scan
acceptance_criteria: |
  <detailed per-file review instructions — see below>
contract_refs: ['workflow:p1_scan']
source_kind: P1_SCAN
metadata:
  p1_scan: true
  scan_kind: P1_SCAN
  spoke_slug: <spoke name>
  project_root: /absolute/path/to/spoke
  master_report_path: docs/reports/<spoke-slug>-p1-scan.md
  god_file_path: docs/reports/<spoke-slug>-p1-scan-god.md
  filename: <original filename>
  scan_timestamp: <ISO timestamp>
```

**scan_kind filter:** P1_SCAN scan record stored in `hall_scans` with `scan_kind: 'P1_SCAN'` and `repo_id: <CStar repo_id>`. All beads for this pipeline share this scan_id.

**Acceptance criteria instructions per bead (example for Rust):**
```
Review /absolute/path/to/file.rs for:
- Security vulnerabilities (injection, auth bypass, secrets)
- Null pointer / nil dereference risks
- Race conditions in async code
- Memory leaks (unclosed handles, unbounded growth)
- Architectural problems (tight coupling, god modules, missing abstraction layers)

Output JSON to the file's .stats entry:
.steps: array of {file, line, severity, type, description}
.steps[].severity: CRITICAL|HIGH|MEDIUM|LOW
.steps[].type: security|bug|memory|race|architectural
.steps[].description: plain English explanation

Append a one-line summary to the master report at:
docs/reports/<spoke-slug>-p1-scan.md

Format: | FILENAME | OVERALL_SCORE | CRITICAL_COUNT | TOP_FINDING |
```

### 2. Gemma Cron — Processes Beads One by One

Trigger: Separate cron fires after Hermes bead creation is complete.

Gemma calls a new `BeadLedger.claim_next_p1_scan_bead(agent_id)` method that:
- Adds `scan_id IS NOT NULL` and `scan_kind = 'P1_SCAN'` filter to the claim query
- Returns only P1_SCAN beads, not any other bead type

**Gemma's per-bead workflow:**
1. Read file from disk (`target_path` in bead)
2. Execute code review per `acceptance_criteria`
3. Write findings to `.stats/<flattened-path>.qmd`
4. Append one-line summary to `master_report_path`
5. Call `BeadLedger.mark_ready_for_review(bead_id)` or `resolve_bead(bead_id)`

### 3. Hermes Morning Brief Cron — Synthesize God File

Trigger: Morning cron (`hermes cron`)

Hermes checks master reports for all active spokes. For each spoke with a new master report:
1. Reads all `.stats/<path>.qmd` files for that spoke
2. Reads the master report
3. Synthesizes a God file: `docs/reports/<spoke-slug>-p1-scan-god.md`
4. Updates CEO on overnight scan results

The God file maintains current spoke status + historical scan diffs (previous scan vs. current).

---

## Key Design Decisions

### Bead Queryability
All P1_SCAN metadata is flat and indexed where possible:
- `source_kind = 'P1_SCAN'` — primary filter for scan beads
- `scan_id` links to `HallScanRecord` with `scan_kind: 'P1_SCAN'`
- `metadata.p1_scan = true` — Hall-level search filter
- `metadata.spoke_slug` — per-spoke grouping

This enables: "show me all scan beads for spoke X", "show me all P1_SCAN beads across the estate", "what did we find on file Y across all scans".

### Cross-Spoke File Resolution
- `repo_id` on all scan beads = CStar's repo_id (Hall lives in CStar)
- `target_path` = absolute path to file in the mounted spoke's filesystem
- Gemma resolves files against `metadata.project_root`

### Master Report Location
- `docs/reports/<spoke-slug>-p1-scan.md` — cumulative per-spoke, timestamp in metadata
- Not in `.stats/` (keep stats clean, reports separate)
- God file: `docs/reports/<spoke-slug>-p1-scan-god.md` — fixed name per spoke, overwrites each scan

### scan_kind = 'P1_SCAN'
Existing scan kinds in codebase: `pennyone_sector_index`, `pennyone_repository_scan`, `legacy_mission_trace`. New scan kind is `P1_SCAN`.

---

## New BeadLedger Method

```python
def claim_next_p1_scan_bead(self, agent_id: str) -> dict[str, Any] | None:
    """
    Claims the next claimable P1_SCAN bead for the given agent.
    Restricts to beads that:
    - Have a scan_id linking to a P1_SCAN scan record
    - Have source_kind = 'P1_SCAN'
    - Status in ('SET', 'OPEN')
    - Are actionable (has target_path, acceptance_criteria, contract refs)
    """
    self.normalize_existing_beads()
    with self.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        bead = self._select_next_p1_scan_bead(conn)
        if bead is None:
            return None
        claimed = self._claim_bead_in_transaction(conn, bead, agent_id)
    self.sync_tasks_projection()
    return claimed.to_public_dict() if claimed else None
```

`_select_next_p1_scan_bead` joins `hall_beads` to `hall_scans` and filters on `scan_kind = 'P1_SCAN'`.

---

## Open Questions — RESOLVED

1. **Bead creation trigger granularity** — RESOLVED: Upfront. Hermes creates all beads for the scan session at once. All files must be known upfront.

2. **Gemma model path** — RESOLVED: Gemma reads files from disk using absolute `target_path` values. The project root is simply the absolute path to the mounted spoke on the filesystem. No special registry access needed — just pass the path.

3. **God file diff logic** — RESOLVED: Overwrite with history archive. Each new scan produces a new God file; the previous version is archived (not deleted) before overwrite.

4. **Scan session boundary** — RESOLVED: One distinct `HallScanRecord` with its own `scan_id` per scan session. Previous scan records remain in the Hall for historical tracking.

5. **Auto-trigger on spoke mount** — RESOLVED: Yes. When a spoke mounts to CStar, a P1_SCAN auto-triggers immediately.

---

## Related Files

- `/src/core/engine/bead_ledger.py` — BeadLedger class, needs `claim_next_p1_scan_bead()` method
- `/src/types/hall.ts` — `HallBeadRecord`, `HallScanRecord` type definitions
- `/src/core/engine/hall_schema.py` — `HallBeadRecord` dataclass
- `/src/tools/pennyone/intel/bead_controller.ts` — existing bead lifecycle controller
- `/src/tools/pennyone/intel/repository_manager.ts` — scan record creation
- `/docs/PENNYONE_MAP.qmd` — PennyOne navigational map (reference)
- `/docs/architecture/legacy_archive/PENNYONE_V2_BLUEPRINT.qmd` — PennyOne v2 architecture

---

*This bead captures the agreed pipeline design. Implementation started: `claim_next_p1_scan_bead()` and `_select_next_p1_scan_bead()` added to BeadLedger (bead_ledger.py).*
