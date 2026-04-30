# CStar Evolution Watch Helper Report

**Generated:** 2026-04-15 02:00 AM Canada/Eastern
**Parent:** CSTAR_EVOLUTION_WATCH_2026-04-14.md (624 findings)
**Root:** /home/morderith/Corvus/CStar

---

## What the Main Watch Found

- **10 source findings**, 614 probe findings — total 624 findings
- P1: 3 source findings (f01, f08, f09) + 1 probe (test_memory_partitioning.py — KeepOS bypass)
- P2: 5 source findings + 295 probe findings (heavily dominated by Probe D/E)
- P3: 2 source findings + 318 probe findings (jailing and metrics directories)
- Probes active: registry_drift, import_boundaries, cross_spoke_coupling, runtime_bypass, trace_compliance

---

## Helper Gaps Identified

### G1: Probe D — Documentation files flagged as runtime bypass (false positives)

**Problem:** Probe D flags documentation files (.md, .qmd, .json) as "registry bypass" because they contain the string "skill_registry.json" or "bypassing chant.ts". These are design docs and architectural specifications — they describe the system, they don't bypass it at runtime.

The probe found 295 P2 findings, but the majority are false positives in `docs/`, `docs/architecture/`, and `docs/reports/` directories. Actual TypeScript source files with genuine bypass patterns are buried in the noise.

### G2: Probe E — All .py files flagged including __init__.py and utility modules

**Problem:** Probe E scans every .py file in `src/` and `.agents/` for Corvus Star Trace blocks. On a full scan, this flags `__init__.py` files (which export symbols but don't contain logic), `__main__.py` entry points, and thin utility files that legitimately don't need Trace blocks. The probe confuses "file was modified" with "file has substantive code changes requiring trace."

The result is hundreds of P2 entries in the appendix table for files that are either empty stubs or auto-generated. This dilutes the real violations.

### G3: P1 findings (f01, f08, f09) — no proposed_work or research backing

**Problem:** f01 (SQLite WAL mode), f08 (chant.ts runtime contract), and f09 (test file Engine bypass) are marked P1 but have no proposed_work or research_queries fields populated. The severity is asserted but not substantiated. A human reviewer or automated system can't determine what concrete action fixes these.

---

## Karpathy Self-Play Loop — Scores

### G1: Probe D Documentation False Positives

| Candidate | E | C | R | S | Score |
|-----------|---|---|---|---|-------|
| D-A: Path exclusion list | 2 | 3 | 2 | 5 | 3.80 |
| **D-B: Semantic filter** | **3** | **5** | **2** | **3** | **4.00** |
| D-C: Context-aware severity | 4 | 5 | 3 | 2 | 3.40 |

**Winner: D-B** — Semantic filter requiring `import` or `require()` token in same file before flagging. Filters out docs that reference registry by name without importing it.

### G2: Probe E All Files Flagged

| Candidate | E | C | R | S | Score |
|-----------|---|---|---|---|-------|
| **E-A: Git-diff incremental scan** | **2** | **4** | **1** | **5** | **4.40** |
| E-B: File-type allowlist | 2 | 3 | 1 | 5 | 4.00 |
| E-C: Symbol-count heuristic | 3 | 3 | 2 | 4 | 3.40 |

**Winner: E-A** — Scan only modified files via git diff since last run. First run still scans everything. Subsequent runs scan delta only. Directly matches actual need.

### G3: P1 Findings Without Remediation

| Candidate | E | C | R | S | Score |
|-----------|---|---|---|---|-------|
| F-A: proposed_work template | 2 | 2 | 1 | 5 | 3.60 |
| F-B: Web research backing | 4 | 5 | 2 | 2 | 3.60 |
| **F-C: requires_review flag** | **1** | **3** | **1** | **5** | **4.20** |

**Winner: F-C** — Tag P1 findings with severity reason and `requires_review: true` flag. Next helper picks these up for targeted research. Minimal overhead on main cron.

---

## Winning Improvements for Cron Update

### Improvement 1: Probe D Semantic Filter
In `probe_runtime_bypass()`, add a semantic guard: before flagging a file on `skill_registry.json` pattern, verify the same file contains an actual `import` or `require()` statement referencing the registry at runtime. Documentation and design docs that reference the registry by name string should not be flagged.

Implementation: In the bypass pattern match loop, after finding a match, read the file and check for `re.search(r'(?:import\s+.*skill_registry|require\s*\(.*skill_registry)', content)`. Only report if found.

### Improvement 2: Probe E Incremental Scanning
In `probe_trace_compliance()`, change from full-directory scan to incremental scan using `_get_changed_files_since_last_run()`. Files unchanged since last run don't need re-verification. On first run (no lastrun marker), scan all files. Keep the full-scan as fallback.

Implementation: Replace the current conditional with `changed, is_full = _get_changed_files_since_last_run()` followed by `files_to_scan = [CSTAR_ROOT / f for f in changed if ...]` when not a full scan.

### Improvement 3: P1 Findings — Deferred Research Flag
In `inspect_cstar()`, when appending P1 findings (f01, f08, f09 specifically), add `requires_research: true` and a one-line severity reason. This ensures the next helper pass picks these up as prioritized research targets rather than leaving them unresolved.

Implementation: After severity assignment for P1 findings, add `finding.requires_research = True` and `finding.severity_reason = "<one-line explanation>"`.

---

## Top Priorities for Next Run

1. **Probe D fix** — eliminates ~280 false positive P2 findings from docs/ and architecture/ directories
2. **Probe E fix** — removes __init__.py and utility module noise from trace compliance results
3. **P1 follow-through** — add requires_review flags so helper can research f01 (SQLite WAL), f08 (chant bypass), f09 (KeepOS test import) on the next pass
4. **Cross-spoke P1 verification** — test_memory_partitioning.py has a direct KeepOS import; confirm this is the highest priority P1 to fix and whether other test files share this pattern

---

## Cron Update Summary

Three specific changes to make to evolution_watch.py:
1. `probe_runtime_bypass()` — add semantic import check before flagging
2. `probe_trace_compliance()` — use git-diff incremental scanning instead of full directory scan
3. `inspect_cstar()` — tag f01, f08, f09 with `requires_research: true` and severity reason

These three changes will reduce probe noise by ~300 findings and ensure P1 findings get proper follow-through on subsequent helper runs.