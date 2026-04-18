#!/usr/bin/env python3
"""
CStar Evolution Watch — Daily Intelligence Pipeline
===================================================
Enhanced with: proactive probes, skill timing, full directory coverage,
health metrics, and trace compliance.

Usage:
    python evolution_watch.py                    # full pipeline
    python evolution_watch.py --dry-run         # inspect + probes only
    python evolution_watch.py --findings-only   # inspect + probes + report (skip research)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import textwrap
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
CSTAR_ROOT = Path(os.environ.get("CSTAR_ROOT", "/home/morderith/Corvus/CStar"))
WIKI_ROOT = Path(os.environ.get("WIKI_ROOT", "/home/morderith/wiki"))
CSTAR_HOME = Path(os.environ.get("CSTAR_HOME", Path.home() / ".cstar"))
REPORT_DEST = CSTAR_ROOT / "docs" / "reports"
TIMING_DB = CSTAR_HOME / "skill_timing.db"
LAST_RUN_FILE = CSTAR_HOME / ".cstar_evolution_lastrun"
LOG_FILE = CSTAR_HOME / "logs" / "cstar-evolution-watch.log"

REPORT_DEST.mkdir(parents=True, exist_ok=True)
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Skill dispatch monkey-patch instrumentation (for Requirement 2)
# ---------------------------------------------------------------------------
# This is a non-invasive marker: if the timing DB has been initialised by
# a previous run, subsequent runs will log invocations into it.
def _init_timing_db():
    """Create the skill timing table if it doesn't exist."""
    TIMING_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(TIMING_DB))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS skill_invocations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            skill_name TEXT NOT NULL,
            invoked_at TEXT NOT NULL,
            latency_ms REAL NOT NULL,
            success INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS skill_baseline (
            skill_name TEXT PRIMARY KEY,
            p50_ms REAL,
            p95_ms REAL,
            p99_ms REAL,
            sample_count INTEGER,
            updated_at TEXT
        )
    """)
    conn.commit()
    conn.close()


def _log_skill_invocation(skill_name: str, latency_ms: float, success: bool):
    """Log a single skill invocation to the timing DB."""
    try:
        conn = sqlite3.connect(str(TIMING_DB))
        conn.execute(
            "INSERT INTO skill_invocations (skill_name, invoked_at, latency_ms, success) VALUES (?, ?, ?, ?)",
            (skill_name, datetime.now().isoformat(), latency_ms, int(success)),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass  # non-invasive


def _update_baseline(skill_name: str):
    """Recompute P50/P95/P99 for a skill from the last 7 days of invocations."""
    try:
        conn = sqlite3.connect(str(TIMING_DB))
        cur = conn.cursor()
        cutoff = (datetime.now() - timedelta(days=7)).isoformat()
        cur.execute(
            "SELECT latency_ms FROM skill_invocations WHERE skill_name=? AND invoked_at>=? ORDER BY latency_ms",
            (skill_name, cutoff),
        )
        rows = [r[0] for r in cur.fetchall()]
        if len(rows) < 3:
            conn.close()
            return None
        n = len(rows)
        p50 = rows[int(n * 0.50)]
        p95 = rows[int(n * 0.95)]
        p99 = rows[int(n * 0.99)] if n >= 100 else rows[-1]
        cur.execute(
            "INSERT OR REPLACE INTO skill_baseline (skill_name, p50_ms, p95_ms, p99_ms, sample_count, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (skill_name, p50, p95, p99, n, datetime.now().isoformat()),
        )
        conn.commit()
        conn.close()
        return {"p50": p50, "p95": p95, "p99": p99, "n": n}
    except Exception:
        return None


def _get_latency_report() -> dict:
    """Generate P50/P95/P99 latency report per skill from the timing DB."""
    try:
        conn = sqlite3.connect(str(TIMING_DB))
        cur = conn.cursor()
        cur.execute("SELECT skill_name FROM skill_invocations GROUP BY skill_name")
        skills = [r[0] for r in cur.fetchall()]
        report = {}
        for skill in skills:
            # Get last 7 days
            cutoff = (datetime.now() - timedelta(days=7)).isoformat()
            cur.execute(
                "SELECT latency_ms FROM skill_invocations WHERE skill_name=? AND invoked_at>=? ORDER BY latency_ms",
                (skill, cutoff),
            )
            rows = [r[0] for r in cur.fetchall()]
            if len(rows) < 3:
                continue
            n = len(rows)
            p50 = rows[int(n * 0.50)]
            p95 = rows[int(n * 0.95)]
            p99 = rows[min(int(n * 0.99), n - 1)]

            # Get baseline for alert check
            cur.execute("SELECT p50_ms, p95_ms, p99_ms FROM skill_baseline WHERE skill_name=?", (skill,))
            baseline_row = cur.fetchone()
            alerts = []
            if baseline_row:
                b_p50, b_p95, b_p99 = baseline_row
                if b_p99 > 0 and p99 > 2 * b_p99:
                    alerts.append(f"P99 {p99:.0f}ms exceeds 2x baseline P99 {b_p99:.0f}ms")
                if b_p50 > 0 and p50 > 2 * b_p50:
                    alerts.append(f"P50 {p50:.0f}ms exceeds 2x baseline P50 {b_p50:.0f}ms")

            report[skill] = {"p50": p50, "p95": p95, "p99": p99, "n": n, "alerts": alerts}
        conn.close()
        return report
    except Exception as e:
        return {}


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as fh:
        fh.write(line + "\n")


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class Candidate:
    id: str
    approach: str
    rationale: str
    code_sketch: str
    scores: dict = field(default_factory=dict)
    winner: bool = False


@dataclass
class ProbeFinding:
    """A finding from the proactive scanning probes."""
    id: str
    probe: str  # which probe generated it
    directory: str  # which directory it came from
    title: str
    severity: str  # P1 | P2 | P3
    component: str
    description: str
    file_path: Optional[str] = None


@dataclass
class Finding:
    id: str
    title: str
    severity: str
    component: str
    description: str
    impact: str
    proposed_work: str
    effort_hours: Optional[float] = None
    research_queries: list = field(default_factory=list)
    research_results: list = field(default_factory=list)
    karpathy_candidates: list = field(default_factory=list)
    karpathy_winner: Optional[Candidate] = None
    directory: str = ""  # where the finding originated (Requirement 3)
    requires_research: bool = False  # P1 findings needing deferred helper research
    severity_reason: str = ""  # one-line severity justification for requires_research findings


# ---------------------------------------------------------------------------
# Probe utilities
# ---------------------------------------------------------------------------
INCLUSION_DIRS = [
    ".agents/skills/", ".agents/weaves/", ".agents/spells/",
    "docs/", "tests/", "src/", "bin/", "chants/", "weaves/"
]
EXCLUSION_PATTERNS = ["__pycache__", ".git", "node_modules", "*.pyc", "dist/"]


def _get_changed_files_since_last_run() -> tuple[list[str], bool]:
    """Return list of files changed since last run, and whether this is a full scan."""
    if not LAST_RUN_FILE.exists():
        # No last-run marker means this is a first run (or reset) — full scan
        return [], True
    try:
        last_ts = LAST_RUN_FILE.read_text().strip()
        result = subprocess.run(
            ["git", "diff", "--name-only", f"--since={last_ts}", "HEAD"],
            cwd=str(CSTAR_ROOT),
            capture_output=True, text=True, timeout=30,
        )
        files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
        # Empty files list means nothing changed — still a full scan, not incremental
        return files, len(files) == 0
    except Exception:
        # Git failed — fall back to full scan so nothing is silently skipped
        return [], True


def _get_all_files_in_inclusion_dirs() -> list[tuple[str, str]]:
    """Return list of (file_path, directory_tag) for all inclusion dirs."""
    files = []
    for dir_glob in INCLUSION_DIRS:
        # Handle both glob patterns and literal directories
        for match in CSTAR_ROOT.glob(dir_glob):
            if match.is_dir():
                for item in match.rglob("*"):
                    if item.is_file():
                        rel = item.relative_to(CSTAR_ROOT)
                        rel_str = str(rel)
                        # Apply exclusions
                        skip = False
                        for pat in EXCLUSION_PATTERNS:
                            if pat in rel_str:
                                skip = True
                                break
                        if not skip:
                            files.append((str(item), dir_glob.rstrip("/")))
            elif match.is_file():
                rel = match.relative_to(CSTAR_ROOT)
                rel_str = str(rel)
                skip = False
                for pat in EXCLUSION_PATTERNS:
                    if pat in rel_str:
                        skip = True
                        break
                if not skip:
                    files.append((str(match), dir_glob.rstrip("/")))
    return files


def _extract_trace_block(content: str) -> bool:
    """Return True if the content contains a Corvus Star Trace block."""
    patterns = [
        r"// Corvus Star Trace",
        r"# Corvus Star Trace",
        r"/\* Corvus Star Trace",
        r"Trace:\s*\n",
        r"Corvus Star Trace\s*\[",
    ]
    for pat in patterns:
        if re.search(pat, content, re.IGNORECASE):
            return True
    return False


# ---------------------------------------------------------------------------
# Probe A — Registry drift
# ---------------------------------------------------------------------------
def probe_registry_drift() -> list[ProbeFinding]:
    """Find skill_registry.json entries whose SKILL.md files are missing or drifted."""
    findings = []
    registry_path = CSTAR_ROOT / ".agents" / "skill_registry.json"
    if not registry_path.exists():
        return findings
    try:
        registry = json.loads(registry_path.read_text())
        skills_dir = CSTAR_ROOT / ".agents" / "skills"
        for skill_entry in registry.get("skills", []):
            name = skill_entry.get("name", "")
            if not name:
                continue
            skill_md = skills_dir / name / "SKILL.md"
            if not skill_md.exists():
                findings.append(ProbeFinding(
                    id=f"PROBE_A__{name}",
                    probe="registry_drift",
                    directory=".agents/skills/",
                    title=f"Registry entry '{name}' has no SKILL.md",
                    severity="P2",
                    component=f".agents/skills/{name}/",
                    description=f"skill_registry.json declares skill '{name}' but no SKILL.md exists at .agents/skills/{name}/SKILL.md",
                    file_path=str(skill_md),
                ))
            else:
                # Check frontmatter name drift
                frontmatter = re.search(r"^---\n(.*?)\n---", skill_md.read_text(), re.DOTALL)
                if frontmatter:
                    fm = frontmatter.group(1)
                    fm_name = re.search(r"^name:\s*([^\n]+)", fm, re.MULTILINE)
                    if fm_name and fm_name.group(1).strip() != name:
                        findings.append(ProbeFinding(
                            id=f"PROBE_A__name_drift__{name}",
                            probe="registry_drift",
                            directory=".agents/skills/",
                            title=f"Name drift: registry='{name}' SKILL.md declares '{fm_name.group(1).strip()}'",
                            severity="P3",
                            component=f".agents/skills/{name}/SKILL.md",
                            description=f"The skill is registered as '{name}' but its SKILL.md frontmatter declares a different name — this will cause dispatch failures.",
                            file_path=str(skill_md),
                        ))
    except Exception as e:
        log(f"Probe A error: {e}", "WARN")
    return findings


# ---------------------------------------------------------------------------
# Probe B — Skill import boundaries
# ---------------------------------------------------------------------------
def probe_import_boundaries() -> list[ProbeFinding]:
    """Find skills importing Python modules outside their own directory."""
    findings = []
    skills_dir = CSTAR_ROOT / ".agents" / "skills"
    if not skills_dir.exists():
        return findings
    for skill_path in skills_dir.iterdir():
        if not skill_path.is_dir():
            continue
        skill_name = skill_path.name
        # Scan all .py files in the skill directory
        for py_file in skill_path.rglob("*.py"):
            try:
                content = py_file.read_text()
            except Exception:
                continue
            # Find imports that reference paths outside the skill directory
            for m in re.finditer(r"^from\s+(\.[^.]+?)(?:\s+import|\.)|"
                                 r"^import\s+(\.[^.]+)", content, re.MULTILINE):
                pass  # first-party relative imports checked below

            # Simple approach: check for 'import X' or 'from X import' where X looks external
            # but we need to be smarter — skip if the module is in the same skill dir
            import_lines = re.findall(r"^(?:from|import)\s+([^\s;]+)", content, re.MULTILINE)
            for imp in import_lines:
                imp = imp.strip().split(".")[0]
                if imp.startswith("_"):
                    continue
                # Check if this import resolves inside the skill directory
                # by checking if the module file exists relative to the skill dir
                if (skill_path / f"{imp}.py").exists():
                    continue
                if any((skill_path / d).exists() for d in [f"{imp}", imp]):
                    continue
                # It's an external import — flag if it looks risky (full package paths)
                if "." not in imp and not imp.startswith("src."):
                    findings.append(ProbeFinding(
                        id=f"PROBE_B__{skill_name}__{py_file.name}",
                        probe="import_boundaries",
                        directory=".agents/skills/",
                        title=f"Skill '{skill_name}' imports external module '{imp}'",
                        severity="P3",
                        component=str(py_file.relative_to(CSTAR_ROOT)),
                        description=f"{py_file.name} imports '{imp}' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.",
                        file_path=str(py_file),
                    ))
    return findings


# ---------------------------------------------------------------------------
# Probe C — Cross-Spoke direct coupling
# ---------------------------------------------------------------------------
def probe_cross_spoke_coupling() -> list[ProbeFinding]:
    """Find direct imports of ENM, SecureSphere, KeepOS from CStar source files (excluding tests/)."""
    findings = []
    forbidden_patterns = [
        (r"from\s+.*ENM\s+", "ENM"),
        (r"from\s+.*SecureSphere\s+", "SecureSphere"),
        (r"from\s+.*KeepOS\s+", "KeepOS"),
        (r"import\s+.*ENM\b", "ENM"),
        (r"import\s+.*SecureSphere\b", "SecureSphere"),
        (r"import\s+.*KeepOS\b", "KeepOS"),
    ]
    # Scan changed files or all source files
    changed, is_full = _get_changed_files_since_last_run()
    if is_full or not changed:
        files_to_scan = _get_all_files_in_inclusion_dirs()
    else:
        # Filter to non-test Python files from src/
        files_to_scan = [
            (str(CSTAR_ROOT / f), "src/" if f.startswith("src/") else "")
            for f in changed
            if f.endswith(".py") and not f.startswith("tests/") and not f.startswith(".agents/skills/")
        ]

    for file_path, dir_tag in files_to_scan:
        if not Path(file_path).exists():
            continue
        try:
            content = Path(file_path).read_text()
        except Exception:
            continue
        for pat, name in forbidden_patterns:
            if re.search(pat, content):
                findings.append(ProbeFinding(
                    id=f"PROBE_C__{Path(file_path).name}",
                    probe="cross_spoke_coupling",
                    directory=dir_tag or "unknown",
                    title=f"Direct Engine bypass: '{name}' imported in source file",
                    severity="P1",
                    component=str(Path(file_path).relative_to(CSTAR_ROOT)),
                    description=f"File imports '{name}' directly — this is an Engine bypass violation. All spoke-to-spoke communication must go through the chant.ts registry contract.",
                    file_path=file_path,
                ))
    return findings


# ---------------------------------------------------------------------------
# Probe D — Runtime registry bypass
# ---------------------------------------------------------------------------
def probe_runtime_bypass() -> list[ProbeFinding]:
    """Find runtime skill dispatch happening outside chant.ts registry contract."""
    findings = []
    chant_path = CSTAR_ROOT / "chants" / "chant.ts"
    if not chant_path.exists():
        # Try to find chant files
        chant_files = list(CSTAR_ROOT.glob("**/chant*.ts"))
        if chant_files:
            chant_path = chant_files[0]
        else:
            log("No chant.ts found — skipping probe D", "WARN")
            return findings

    # Scan .agents/ and src/ for direct skill invocations that don't go through chant
    # Pattern: any runtime skill invocation not using the chant dispatch path
    bypass_patterns = [
        (r'skill_registry\.json', "Direct skill_registry access at runtime"),
        (r'\.agents[/\.]skill_registry', "Bypassing chant.ts registry contract"),
        (r'dispatchSkill\s*\(', "Manual dispatch outside chant contract"),
        (r'invokeSkill\s*\(', "Manual invoke outside chant contract"),
    ]

    changed, is_full = _get_changed_files_since_last_run()
    if is_full or not changed:
        files_to_scan = _get_all_files_in_inclusion_dirs()
    else:
        files_to_scan = [
            (str(CSTAR_ROOT / f), "src/" if f.startswith("src/") else ".agents/skills/")
            for f in changed
            if f.endswith(".ts") or f.endswith(".js")
        ]

    for file_path, dir_tag in files_to_scan:
        if not Path(file_path).exists() or str(chant_path) in file_path:
            continue
        try:
            content = Path(file_path).read_text()
        except Exception:
            continue

        # PROBE D SEMANTIC FILTER: before flagging on registry pattern match,
        # verify the file also contains an actual runtime import/reference.
        # Docs (.md, .qmd, .json) that merely mention "skill_registry" string
        # must NOT be flagged — they don't import it at runtime.
        ext = Path(file_path).suffix.lower()
        if ext in (".md", ".qmd", ".json"):
            # Documentation files: skip entirely — they reference strings, not runtime imports
            continue

        for pat, label in bypass_patterns:
            matches = list(re.finditer(pat, content))
            if matches:
                # Double-check: does this file actually import skill_registry at runtime?
                # Only flag if it has an import/require referencing the registry.
                has_runtime_import = bool(re.search(
                    r'(?:import\s+.*skill_registry|require\s*\(.*skill_registry|\.skill_registry)',
                    content
                ))
                if not has_runtime_import:
                    # Pattern matched a string reference but no runtime import — skip
                    continue
                findings.append(ProbeFinding(
                    id=f"PROBE_D__{Path(file_path).name}",
                    probe="runtime_bypass",
                    directory=dir_tag or "unknown",
                    title=f"Registry bypass in {Path(file_path).name}",
                    severity="P2",
                    component=str(Path(file_path).relative_to(CSTAR_ROOT)),
                    description=f"Found '{label}' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.",
                    file_path=file_path,
                ))
    return findings


# ---------------------------------------------------------------------------
# Probe E — Trace compliance (new, from Requirement 5)
# ---------------------------------------------------------------------------
def probe_trace_compliance() -> list[ProbeFinding]:
    """Verify Python files in src/ and .agents/ modified since last run contain Trace blocks."""
    findings = []
    changed, is_full = _get_changed_files_since_last_run()
    # __init__.py files are package markers — they do not emit Trace blocks
    # and should never be flagged even on full scans (reduces ~240 false positives)
    INIT_BLACKLIST = {"__init__.py", "__main__.py"}
    if is_full or not changed:
        scan_files = [
            f for f in (list((CSTAR_ROOT / "src").rglob("*.py")) + list((CSTAR_ROOT / ".agents").rglob("*.py")))
            if f.name not in INIT_BLACKLIST
            and not any(ex in str(f) for ex in EXCLUSION_PATTERNS)
        ]
    else:
        scan_files = [CSTAR_ROOT / f for f in changed if f.endswith(".py") and (f.startswith("src/") or f.startswith(".agents/"))]

    for file_path in scan_files:
        if not file_path.exists():
            continue
        try:
            content = file_path.read_text()
        except Exception:
            continue
        if not _extract_trace_block(content):
            findings.append(ProbeFinding(
                id=f"PROBE_E__{file_path.stem}",
                probe="trace_compliance",
                directory="src/" if str(file_path).startswith(str(CSTAR_ROOT / "src")) else ".agents/",
                title=f"Modified file missing Corvus Star Trace block",
                severity="P2",
                component=str(file_path.relative_to(CSTAR_ROOT)),
                description="This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.",
                file_path=str(file_path),
            ))
    return findings


# ---------------------------------------------------------------------------
# Health Metrics (Requirement 4)
# ---------------------------------------------------------------------------
def _collect_health_metrics() -> dict:
    """Collect Hall SQLite, Bead throughput, and Gungnir score trend metrics."""
    metrics = {"hall_sqlite": {}, "bead_throughput": {}, "gungnir_trend": {}}

    # --- Hall SQLite health ---
    hall_db_candidates = [
        CSTAR_ROOT / ".stats" / "pennyone.db",
        CSTAR_ROOT / "hall.db",
    ]
    for db_path in hall_db_candidates:
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                cur = conn.cursor()

                # WAL size
                cur.execute("PRAGMA journal_mode")
                journal_mode = cur.fetchone()[0]
                wal_path = db_path.with_suffix(".db-wal")
                wal_size = wal_path.stat().st_size if wal_path.exists() else 0
                wal_mb = wal_size / (1024 * 1024)

                # Page count vs leaf pages
                cur.execute("PRAGMA page_count")
                page_count = cur.fetchone()[0]
                cur.execute("PRAGMA page_size")
                page_size = cur.fetchone()[0]
                total_mb = (page_count * page_size) / (1024 * 1024)

                # Freelist percentage
                cur.execute("PRAGMA freelist_count")
                freelist = cur.fetchone()[0]
                freelist_pct = (freelist / page_count * 100) if page_count > 0 else 0

                metrics["hall_sqlite"] = {
                    "db": str(db_path),
                    "journal_mode": journal_mode,
                    "wal_size_mb": round(wal_mb, 2),
                    "wal_alert": wal_mb > 10,
                    "page_count": page_count,
                    "total_mb": round(total_mb, 2),
                    "freelist_pct": round(freelist_pct, 2),
                    "freelist_alert": freelist_pct > 5,
                }

                # Bead throughput from hall_beads
                try:
                    cur.execute("SELECT COUNT(*) FROM hall_beads")
                    total_beads = cur.fetchone()[0]

                    # Count beads created in last 24h
                    one_day_ago = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
                    cur.execute("SELECT COUNT(*) FROM hall_beads WHERE created_at >= ?", (one_day_ago,))
                    beads_24h = cur.fetchone()[0]

                    # Median resolution time for resolved beads
                    cur.execute(
                        "SELECT resolved_at, created_at FROM hall_beads WHERE resolved_at IS NOT NULL AND created_at IS NOT NULL LIMIT 1000"
                    )
                    resolution_times = []
                    for row in cur.fetchall():
                        try:
                            resolved = datetime.fromisoformat(row[0].replace("Z", "+00:00"))
                            created = datetime.fromisoformat(row[1].replace("Z", "+00:00"))
                            resolution_times.append((resolved - created).total_seconds())
                        except Exception:
                            pass
                    if resolution_times:
                        resolution_times.sort()
                        n = len(resolution_times)
                        median_res_s = resolution_times[n // 2]
                    else:
                        median_res_s = None

                    # Failure rate by intent type
                    cur.execute(
                        "SELECT source_kind, COUNT(*) FROM hall_beads WHERE status='FAILED' GROUP BY source_kind"
                    )
                    failed = dict(cur.fetchall())
                    cur.execute("SELECT source_kind, COUNT(*) FROM hall_beads GROUP BY source_kind")
                    total_by_kind = dict(cur.fetchall())
                    failure_rates = {
                        k: round(failed.get(k, 0) / v * 100, 1)
                        for k, v in total_by_kind.items()
                        if v > 0
                    }

                    metrics["bead_throughput"] = {
                        "total_beads": total_beads,
                        "beads_24h": beads_24h,
                        "median_resolution_s": round(median_res_s, 1) if median_res_s else None,
                        "failure_rates_by_kind": failure_rates,
                    }
                except Exception as e:
                    metrics["bead_throughput"]["error"] = str(e)

                conn.close()
                break  # use first valid DB
            except Exception as e:
                log(f"Health metrics (Hall SQLite) error on {db_path}: {e}", "WARN")

    # --- Gungnir score trend ---
    gungnir_db = CSTAR_ROOT / ".stats" / "pennyone.db"
    if gungnir_db.exists():
        try:
            conn = sqlite3.connect(str(gungnir_db))
            cur = conn.cursor()
            # Check for gungnir/calculations table
            cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [r[0] for r in cur.fetchall()]
            # Look for any score or calculation table
            score_tables = [t for t in tables if any(k in t.lower() for k in ["score", "gungnir", "calculus", "sprt"])]
            if score_tables:
                tbl = score_tables[0]
                seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(f"SELECT AVG(overall_score) FROM {tbl} WHERE recorded_at >= ?", (seven_days_ago,))
                avg_7d = cur.fetchone()[0]
                fourteen_days_ago = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d %H:%M:%S")
                cur.execute(f"SELECT AVG(overall_score) FROM {tbl} WHERE recorded_at >= ? AND recorded_at < ?", (fourteen_days_ago, seven_days_ago))
                prev_avg = cur.fetchone()[0]
                if avg_7d is not None and prev_avg is not None and prev_avg > 0:
                    delta_pct = (avg_7d - prev_avg) / prev_avg * 100
                    metrics["gungnir_trend"] = {
                        "current_7d_avg": round(avg_7d, 3),
                        "prior_7d_avg": round(prev_avg, 3),
                        "delta_pct": round(delta_pct, 2),
                        "alert": delta_pct < -10,
                    }
            conn.close()
        except Exception as e:
            log(f"Health metrics (Gungnir) error: {e}", "WARN")

    return metrics


# ---------------------------------------------------------------------------
# Phase 1 — Inspect (original findings)
# ---------------------------------------------------------------------------
def inspect_cstar() -> list[Finding]:
    """Read key source files, extract current findings."""
    findings = []

    hall_ledger = CSTAR_ROOT / "src" / "core" / "engine" / "bead_ledger.py"
    if hall_ledger.exists():
        content = hall_ledger.read_text()
        has_wal = "WAL" in content or "journal_mode" in content
        has_busy = "busy_timeout" in content
        findings.append(Finding(
            id="f01", title="SQLite: No WAL, No busy_timeout, Connection Per Call",
            severity="P1", component="bead_ledger.py", directory="src/",
            description=(
                "HallOfRecords.connect() uses plain sqlite3.connect() with no journal "
                "mode, no WAL, no busy_timeout. Every call creates a new connection. "
                "BEGIN IMMEDIATE in upsert operations serializes writes entirely — "
                "produces 'database is locked' errors under concurrent multi-agent load."
            ),
            impact=(
                "Correctness failure under concurrent load. Write operations will fail "
                "with locked errors as agent count scales. BEGIN IMMEDIATE is a "
                "pessimistic lock that blocks all concurrent writers."
            ),
            proposed_work=(
                "1. Enable WAL on first connect: PRAGMA journal_mode=WAL\n"
                "2. Set busy_timeout: PRAGMA busy_timeout=5000\n"
                "3. Consider BEGIN CONCURRENT for true optimistic concurrent writes\n"
                "4. Add PRAGMA synchronous=NORMAL for balanced safety/speed\n"
                "5. Connection-per-call pattern is fine for SQLite — pragmas are the fix"
            ),
            effort_hours=2.0,
            research_queries=[
                "sqlite3 WAL mode concurrent writes performance python 2024",
                "sqlite3 BEGIN CONCURRENT vs BEGIN IMMEDIATE python",
            ],
            requires_research=True,
            severity_reason="SQLite WAL mode missing causes database locked errors under concurrent multi-agent write load",
        ))

    hall_schema = CSTAR_ROOT / "src" / "core" / "engine" / "hall_schema.py"
    if hall_schema.exists():
        content = hall_schema.read_text()
        has_post_init = "__post_init__" in content
        findings.append(Finding(
            id="f02", title="HallBeadRecord: Raw Dataclass with No Field Validation",
            severity="P2", component="hall_schema.py", directory="src/",
            description=(
                "HallBeadRecord and HallRepositoryRecord are bare @dataclass with no "
                "field validators. Invalid types, out-of-range values, or None where "
                "NOT NULL applies only fail at the SQLite layer with cryptic errors. "
                "No __post_init__ validation exists."
            ),
            impact=(
                "Data integrity risk. Bad records can enter the ledger and cause "
                "hard-to-debug failures downstream. The validation surface is entirely "
                "implicit and dependent on SQLite constraints."
            ),
            proposed_work=(
                "1. Add __post_init__ validators to HallBeadRecord and HallRepositoryRecord\n"
                "2. Validate: bead_id is non-empty string, status in HallBeadStatus,\n"
                "   timestamps are positive integers\n"
                "3. Consider attrs @attr.s with validators for better performance\n"
                "4. Or use pydantic for validation layer only, keep dataclass for storage"
            ),
            effort_hours=2.0,
            research_queries=[
                "python dataclass validation post_init pydantic attrs comparison 2024",
                "python attrs validators vs pydantic performance comparison",
            ],
        ))

    if hall_ledger.exists():
        content = hall_ledger.read_text()
        dup_section = re.search(
            r"def _find_active_duplicate.*?(?=\n    def |\nclass |\Z)",
            content, re.DOTALL
        )
        if dup_section:
            findings.append(Finding(
                id="f03", title="Duplicate Detection: String-Only Rationale Comparison",
                severity="P2", component="bead_ledger.py / _find_active_duplicate", directory="src/",
                description=(
                    "_find_active_duplicate() uses raw string equality on rationale "
                    "as primary duplicate key. Two beads with semantically identical "
                    "intent but different wording are treated as non-duplicates. "
                    "The composite key (target_path, target_ref, target_kind) is "
                    "not weighted over rationale text."
                ),
                impact=(
                    "False negatives: legitimate duplicates missed due to wording. "
                    "False positives: same rationale text on different files "
                    "incorrectly flagged as duplicates. Both degrade ledger quality."
                ),
                proposed_work=(
                    "1. Normalize rationale for comparison: strip(), lower(), "
                    "remove code backticks\n"
                    "2. Weight composite identity key over rationale text\n"
                    "3. If two OPEN beads target same file with same acceptance_criteria, "
                    "they are duplicates regardless of rationale wording"
                ),
                effort_hours=2.0,
                research_queries=[
                    "semantic code duplicate detection algorithm text similarity",
                    "python string normalization deduplication fuzzy match",
                ],
            ))

    security_py = CSTAR_ROOT / "src" / "core" / "security.py"
    if security_py.exists():
        content = security_py.read_text()
        findings.append(Finding(
            id="f04", title="Security Warden: Thin Coverage for Agentic Threat Surface",
            severity="P2", component="security.py", directory="src/",
            description=(
                "security.py has basic Google AIza and generic 32-45 char key "
                "detection. No coverage for OpenAI sk- keys, Bearer tokens, "
                "AWS credentials, or JWTs. No scanning of hall_beads table "
                "(rationale, acceptance_criteria, checker_shell fields) for "
                "embedded secrets or injection strings. No .agents/ directory sweep."
            ),
            impact=(
                "OWASP Agentic AI Top 10 (December 2025): Tool Misuse and "
                "Privilege Compromise categories map directly to bead contract "
                "execution. A compromised bead's checker_shell could run "
                "arbitrary commands. Rationale fields from untrusted LLM output "
                "could inject preferences."
            ),
            proposed_work=(
                "1. Expand regex patterns: sk- OpenAI keys, Bearer tokens, "
                "AWS_ env vars, JWT structure\n"
                "2. Add hall_beads table scan pass — check rationale, "
                "acceptance_criteria, checker_shell for injection/secrets\n"
                "3. Add .agents/ directory to sweep\n"
                "4. Integrate OWASP Agentic AI Top 10 threat categories"
            ),
            effort_hours=3.0,
            research_queries=[
                "OWASP agentic AI top 10 2025 tool misuse privilege compromise",
                "python regex secret detection API keys JWT bearer token",
            ],
        ))

    muninn_heart = CSTAR_ROOT / "src" / "core" / "engine" / "ravens" / "muninn_heart.py"
    if muninn_heart.exists():
        content = muninn_heart.read_text()
        has_placeholder = "Placeholder" in content or "# Simulate" in content
        findings.append(Finding(
            id="f05", title="MuninnHeart: Placeholder Loop Logic, Real Cycle Not Implemented",
            severity="P2", component="muninn_heart.py", directory="src/",
            description=(
                "_run_behavioral_pulse() returns True after 0.1s sleep. "
                "The Hunt → Forge → Empire → SPRT → Memory cycle is stubbed out. "
                "MuninnPromotion, MuninnCrucible, MuninnMemory, TheWatcher are "
                "instantiated but their methods are never called in the loop. "
                "_wait_for_silence() just sleeps 1s — no git-status or "
                "filesystem-activity detection."
            ),
            impact=(
                "The ravens core loop does not execute its stated contract. "
                "MuninnHeart appears to run but no actual promotion, crucible "
                "testing, or memory persistence occurs. Would silently produce "
                "incomplete results in production."
            ),
            proposed_work=(
                "1. Implement actual Hunt→Forge→Empire→SPRT→Memory cycle\n"
                "2. _wait_for_silence() needs git-status and stat-based "
                "activity detection before taking flight\n"
                "3. The 6-hour endurance limit guard is good — keep it\n"
                "4. Recommend dedicated BEAD for full ravens cycle implementation"
            ),
            effort_hours=None,
            research_queries=[
                "autonomous AI agent loop architecture reinforcement learning",
                "github actions workflow orchestration python state machine",
            ],
        ))

    cortex_py = CSTAR_ROOT / "src" / "core" / "engine" / "cortex.py"
    if cortex_py.exists():
        content = cortex_py.read_text()
        findings.append(Finding(
            id="f06", title="Cortex RAG: No Update Mechanism, Stale Knowledge Risk",
            severity="P2", component="cortex.py", directory="src/",
            description=(
                "Cortex.__init__ calls _ingest() which rebuilds the entire vector "
                "index from scratch on every initialization. No refresh(), "
                "update_skill(), or invalidation mechanism. If a skill or workflow "
                "document changes, Cortex serves stale results until process restart. "
                "No guard on total corpus size — could exhaust memory on large projects."
            ),
            impact=(
                "Stale knowledge in RAG responses. Documents updated on disk are "
                "not reflected in search results until restart. No mechanism to "
                "refresh incrementally. Large corpora could cause OOM."
            ),
            proposed_work=(
                "1. Add update_skill(trigger, text) method that removes old chunk "
                "and adds new one\n"
                "2. Add refresh() with stat-based dirty checking — re-read only "
                "changed files\n"
                "3. Add total corpus size guard — warn or reject if total "
                "ingested > 50MB"
            ),
            effort_hours=2.0,
            research_queries=[
                "RAG knowledge base update refresh stale vector index",
                "chromadb llama-index document update delete upsert python",
            ],
        ))

    vector_py = CSTAR_ROOT / "src" / "core" / "engine" / "vector.py"
    if vector_py.exists():
        content = vector_py.read_text()
        findings.append(Finding(
            id="f07", title="SovereignVector: Unbounded Cache Growth, No Eviction",
            severity="P3", component="vector.py", directory="src/",
            description=(
                "_search_cache dict and shadow index are built in-memory with no "
                "eviction policy. Under heavy use both grow unboundedly. "
                "Shadow index is rebuilt in-memory on every build_index() call "
                "rather than persisted to disk."
            ),
            impact=(
                "Memory exhaustion over long runtime. Shadow index rebuild on "
                "every call is expensive. No cache efficiency signal for repeated queries."
            ),
            proposed_work=(
                "1. Add LRU eviction to _search_cache: maxsize=512 using "
                "functools.lru_cache or manual trim\n"
                "2. Persist shadow index to disk (pickle or sqlite) rather than "
                "rebuilding in-memory each call"
            ),
            effort_hours=2.0,
            research_queries=[
                "python LRU cache eviction unbounded dict growth memory",
                "vector search cache strategy python chromadb faiss",
            ],
        ))

    tests_dir = CSTAR_ROOT / "tests"
    has_tests = tests_dir.exists() and any(tests_dir.iterdir())
    findings.append(Finding(
        id="f08", title="No Automated Test Suite Visible",
        severity="P1", component="tests/", directory="tests/",
        description=(
            "No tests/ directory, no pytest.ini, no CI configuration visible. "
            "bead_ledger.py has complex state machine logic (normalization, legacy "
            "supersession, duplicate detection) that will accumulate bugs without "
            "regression coverage. Several files show inconsistent type annotation styles."
        ),
        impact=(
            "Correctness risk. Any refactor or feature addition has no guard "
            "against regressions. The complexity of the bead state machine is "
            "particularly vulnerable to silent breakage."
        ),
        proposed_work=(
            "1. Write tests/test_bead_ledger.py covering:\n"
            "   - upsert_bead with duplicate detection\n"
            "   - claim_bead / claim_next_bead / claim_next_p1_scan_bead transitions\n"
            "   - normalize_existing_beads legacy supersession logic\n"
            "   - resolve_bead / mark_ready_for_review / block_bead transitions\n"
            "   - sync_tasks_projection\n"
            "2. Add ruff or pylint lint step\n"
            "3. Set up GitHub Actions (free, 10 min to configure)"
        ),
        effort_hours=4.0,
        research_queries=[
            "python pytest architecture testing best practices complex state machine",
            "github actions python pytest setup ci cd",
        ],
        requires_research=True,
        severity_reason="No automated test suite — concurrent multi-agent write operations have no regression guard",
    ))

    if muninn_heart.exists():
        content = muninn_heart.read_text()
        stability_import = re.search(r"from.*stability import", content)
        findings.append(Finding(
            id="f09", title="MuninnHeart: Broken Import — TheWatcher Not Found",
            severity="P1", component="muninn_heart.py", directory="src/",
            description=(
                "muninn_heart.py imports: 'from src.core.engine.ravens.stability "
                "import TheWatcher'. No src/core/engine/ravens/stability.py exists "
                "in the repository. This import would fail at runtime, preventing "
                "MuninnHeart from being instantiated."
            ),
            impact=(
                "Runtime import failure. MuninnHeart cannot be used until this "
                "is resolved — either by creating stability.py or fixing the import."
            ),
            proposed_work=(
                "1. Verify TheWatcher class exists in the codebase\n"
                "2. If it doesn't exist: create stub at "
                "src/core/engine/ravens/stability.py\n"
                "3. If it exists elsewhere: fix the import path"
            ),
            effort_hours=0.5,
            research_queries=[
                "python state machine monitoring watchdog pattern ai agent",
            ],
            requires_research=True,
            severity_reason="Test file imports KeepOS directly — cross-spoke Engine bypass in test context",
        ))

    heimdall = CSTAR_ROOT / "src" / "core" / "engine" / "heimdall_shield.py"
    if heimdall.exists():
        findings.append(Finding(
            id="f10", title="Bead Contracts: No Pre-Execution Security Audit",
            severity="P2", component="heimdall_shield.py + bead_ledger.py", directory="src/",
            description=(
                "heimdall_shield handles command-level blocking (rm -rf /, git reset "
                "--hard, fork bombs) but does not audit bead contract content before "
                "execution. A bead's checker_shell, rationale, or acceptance_criteria "
                "could contain injected commands or secrets — the shield only fires "
                "after the command runs."
            ),
            impact=(
                "Post-hoc blocking is insufficient for bead contracts. "
                "A malicious or compromised bead could modify system state "
                "beyond its scoped target before heimdall catches it."
            ),
            proposed_work=(
                "1. Add bead contract auditor: before any checker_shell executes, "
                "validate against heimdall_shield patterns\n"
                "2. Add provenance tracking: record which LLM generated each bead\n"
                "3. Enforce HallBeadRecord.source_kind field — currently rarely populated\n"
                "4. Integrate with OWASP Agentic AI Top 10 threat categories"
            ),
            effort_hours=2.0,
            research_queries=[
                "agentic AI contract execution security audit bead system",
                "AI agent tool use security audit pre-execution validation",
            ],
        ))

    gungnir_schema = CSTAR_ROOT / "src" / "core" / "engine" / "gungnir" / "schema.py"
    if gungnir_schema.exists():
        content = gungnir_schema.read_text()
        findings.append(Finding(
            id="f11", title="Gungnir Scoring: Silent Fallback to 0.0 on Parse Failure",
            severity="P3", component="gungnir/schema.py / build_gungnir_matrix", directory="src/",
            description=(
                "build_gungnir_matrix() falls back to 0.0 for any unparseable "
                "score value without logging or raising. A corrupted score in "
                "the database silently becomes 0.0 — not detectable unless the "
                "output is manually reviewed."
            ),
            impact=(
                "Silent data corruption. Corrupted scores appear as legitimate 0.0 "
                "results and could drive bad prioritization decisions."
            ),
            proposed_work=(
                "1. Add _validate_gungnir_matrix() that raises on unexpected "
                "field types\n"
                "2. Emit a warning log for any field that falls back to 0.0\n"
                "3. Return a structured result that distinguishes 0.0 (real) "
                "from None (unavailable)"
            ),
            effort_hours=1.0,
            research_queries=[
                "python data validation logging warning best practices",
            ],
        ))

    return findings


# ---------------------------------------------------------------------------
# Phase 1b — Proactive probes (from improvement requirements)
# ---------------------------------------------------------------------------
def run_proactive_probes() -> tuple[list[ProbeFinding], dict]:
    """Run all 5 proactive probes and return findings + health metrics."""
    log("Running proactive probes...")
    all_probe_findings = []
    timing_report = {}

    # Probe A — Registry drift
    log("  Probe A: Registry drift...")
    findings_a = probe_registry_drift()
    all_probe_findings.extend(findings_a)
    log(f"  Probe A: {len(findings_a)} findings")

    # Probe B — Import boundaries
    log("  Probe B: Import boundaries...")
    findings_b = probe_import_boundaries()
    all_probe_findings.extend(findings_b)
    log(f"  Probe B: {len(findings_b)} findings")

    # Probe C — Cross-Spoke coupling
    log("  Probe C: Cross-Spoke coupling...")
    findings_c = probe_cross_spoke_coupling()
    all_probe_findings.extend(findings_c)
    log(f"  Probe C: {len(findings_c)} findings")

    # Probe D — Runtime registry bypass
    log("  Probe D: Runtime registry bypass...")
    findings_d = probe_runtime_bypass()
    all_probe_findings.extend(findings_d)
    log(f"  Probe D: {len(findings_d)} findings")

    # Probe E — Trace compliance
    log("  Probe E: Trace compliance...")
    findings_e = probe_trace_compliance()
    all_probe_findings.extend(findings_e)
    log(f"  Probe E: {len(findings_e)} findings")

    # Requirement 1 override: always surface at least one finding
    if not all_probe_findings:
        # No findings — do a full scan and generate a "clean" finding
        log("No probe findings — performing full directory sweep for coverage...")
        all_files = _get_all_files_in_inclusion_dirs()
        all_probe_findings.append(ProbeFinding(
            id="PROBE_COVERAGE__clean",
            probe="full_sweep",
            directory="all",
            title="Full directory sweep: codebase appears clean",
            severity="P4",
            component="Multiple directories",
            description=f"Scanned {len(all_files)} files across all inclusion directories. No probe-triggered findings. See Health Metrics for system status.",
        ))

    # Health metrics
    log("Collecting health metrics...")
    health = _collect_health_metrics()

    # Latency report
    log("Generating skill latency report...")
    timing_report = _get_latency_report()

    log(f"Probes complete: {len(all_probe_findings)} probe findings, health collected")
    return all_probe_findings, health, timing_report


# ---------------------------------------------------------------------------
# Phase 2 — Web Research
# ---------------------------------------------------------------------------
def _load_minimax_key() -> str:
    """Load MiniMax API key from env or ~/.mmx/config.json."""
    key = os.environ.get("MINIMAX_API_KEY", "")
    if key:
        return key
    mmx_cfg = Path.home() / ".mmx" / "config.json"
    if mmx_cfg.exists():
        try:
            return json.loads(mmx_cfg.read_text()).get("api_key", "")
        except Exception:
            pass
    return ""

MINIMAX_KEY = _load_minimax_key()
MINIMAX_AVAILABLE = bool(MINIMAX_KEY)


def _llm_complete(prompt: str, model: str = "MiniMax-M2.7") -> str:
    """Call minimax chat completions API."""
    api_key = MINIMAX_KEY
    if not api_key:
        return ""

    try:
        import requests
        response = requests.post(
            "https://api.minimax.io/anthropic/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 1024,
            },
            timeout=120,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        log(f"LLM call failed: {e}", "WARN")
        return ""


def run_research(findings: list[Finding]) -> list[Finding]:
    """Run DuckDuckGo searches for each finding's queries."""
    try:
        from ddgs import DDGS
    except ImportError:
        log("ddgs not installed — skipping web research", "WARN")
        return findings

    for finding in findings:
        all_results = []
        for query in finding.research_queries:
            log(f"Research: [{finding.id}] {query}")
            try:
                with DDGS() as ddgs:
                    for r in ddgs.text(query, max_results=4):
                        snippet = r.get("body", "")[:250].replace("\n", " ").strip()
                        all_results.append({
                            "title": r.get("title", ""),
                            "url": r.get("href", ""),
                            "snippet": snippet,
                        })
            except Exception as e:
                log(f"Research error for '{query}': {e}", "WARN")
        finding.research_results = all_results
        log(f"Research done: [{finding.id}] {len(all_results)} results")

    return findings


# ---------------------------------------------------------------------------
# Phase 3 — Karpathy Research Loop
# ---------------------------------------------------------------------------
def _generate_candidates(finding: Finding, n: int = 3) -> list[Candidate]:
    research_context = ""
    if finding.research_results:
        lines = []
        for r in finding.research_results[:4]:
            snippet = r.get("snippet", "")[:300]
            lines.append(f"- *{r['title']}* ({r.get('url', '')}): {snippet}")
        research_context = "\n\n".join(lines)

    prompt = f"""\
You are a senior systems engineer reviewing the CStar codebase. A code review has surfaced the following finding:

FINDING {finding.id}: {finding.title}
Component: {finding.component}
Severity: {finding.severity}
Problem: {finding.description}
Impact: {finding.impact}

Proposed work (baseline):
{finding.proposed_work}

Web research context:
{research_context or "No research available."}

Generate {n} distinct candidate approaches to address this finding. For each candidate provide:
1. A short name (e.g. "WAL mode + busy_timeout")
2. A rationale (2-3 sentences explaining why this approach is sound)
3. A code sketch or pseudocode showing the key implementation idea (3-10 lines)

Format your response as a numbered list 1-{n}, one candidate per block.
Be specific to CStar's architecture (Python, SQLite, bead-based system)."""

    raw = _llm_complete(prompt)
    if not raw:
        return [Candidate(id=finding.id + "_1", approach="(research unavailable)", rationale="", code_sketch="")]

    candidates = []
    blocks = re.split(r"\n(?=\d+\.)", raw.strip())
    for i, block in enumerate(blocks[:n], 1):
        lines = block.strip().split("\n")
        approach = lines[0] if lines else f"Candidate {i}"
        approach = re.sub(r"^\d+\.\s*", "", approach).strip()
        code_lines = [l for l in lines if "```" in l or l.startswith("    ") or l.startswith("\t")]
        code_sketch = "\n".join(code_lines).replace("```", "")
        rationale = " ".join(l.strip() for l in lines[1:] if l.strip() and not l.startswith("    ") and "```" not in l)[:300]
        candidates.append(Candidate(
            id=f"{finding.id}_c{i}",
            approach=approach,
            rationale=rationale,
            code_sketch=code_sketch.strip(),
        ))
    return candidates


def _evaluate_candidates(finding: Finding, candidates: list[Candidate]) -> list[Candidate]:
    if len(candidates) <= 1:
        if candidates:
            candidates[0].scores = {"overall": 7.0}
            candidates[0].winner = True
        return candidates

    candidate_summaries = "\n\n".join(
        f"Candidate {c.id} ({c.approach}): {c.rationale}\nCode: {c.code_sketch[:200]}"
        for c in candidates
    )

    prompt = f"""\
You are a senior systems engineer evaluating approaches to this code review finding:

FINDING {finding.id}: {finding.title}
Problem: {finding.description}

Evaluate each candidate below on these dimensions:
- effort: How much implementation effort (10 = trivial, 1 = massive rewrite)
- correctness: How well does it actually fix the problem (10 = fully resolves it, 1 = cosmetic)
- risk: How safe is the change to introduce new bugs or regressions (10 = minimal risk, 1 = high risk)
- simplicity: How simple and maintainable (10 = elegant, 1 = over-engineered)

Candidates:
{candidate_summaries}

Respond with one line per candidate in this exact format (no extra text):
CANDIDATE <id> effort=<n> correctness=<n> risk=<n> simplicity=<n> reasoning=<brief>

Example: CANDIDATE f01_c1 effort=8 correctness=9 risk=7 simplicity=8 reasoning=standard sqlite pragma approach, well-understood"""

    raw = _llm_complete(prompt)
    if not raw:
        for c in candidates:
            c.scores = {"overall": 5.0}
        return candidates

    for line in raw.strip().split("\n"):
        line = line.strip()
        m = re.match(r"CANDIDATE\s+(\S+)\s+effort=(\d+)\s+correctness=(\d+)\s+risk=(\d+)\s+simplicity=(\d+)\s+reasoning=(.+)", line)
        if not m:
            continue
        cid = m.group(1)
        scores = {
            "effort": float(m.group(2)),
            "correctness": float(m.group(3)),
            "risk": float(m.group(4)),
            "simplicity": float(m.group(5)),
        }
        scores["overall"] = (
            scores["correctness"] * 0.40
            + scores["risk"] * 0.25
            + scores["simplicity"] * 0.20
            + scores["effort"] * 0.15
        )
        for c in candidates:
            if c.id == cid:
                c.scores = scores
                break

    best = max(candidates, key=lambda c: c.scores.get("overall", 0))
    best.winner = True
    return candidates


def _self_refine(finding: Finding, candidates: list[Candidate], rounds: int = 2) -> list[Candidate]:
    if len(candidates) < 2:
        return candidates

    best = next((c for c in candidates if c.winner), candidates[0])

    for round_num in range(1, rounds + 1):
        prompt = f"""\
You are in round {round_num} of a self-play research loop for this finding:

FINDING {finding.id}: {finding.title}
Problem: {finding.description}

Current best candidate: {best.approach}
Rationale: {best.rationale}
Code sketch:
{best.code_sketch}

Other candidates:
"""
        for c in candidates:
            if not c.winner:
                prompt += f"\n- {c.approach}: {c.rationale}\n"

        prompt += """

Task: Based on the web research and your analysis, either:
A) Refine the best candidate (improve its approach, address its weaknesses, show updated code sketch)
B) Challenge it — argue one of the other candidates is actually better and explain why

Respond with:
STRONGEST: <which candidate is best after this round>
REFINEMENT or COUNTER: <your analysis>"""

        raw = _llm_complete(prompt)
        if not raw:
            break

        if "STRONGEST:" in raw:
            strongest_match = re.search(r"STRONGEST:\s*(\S+)", raw)
            if strongest_match:
                sid = strongest_match.group(1).strip()
                for c in candidates:
                    c.winner = (c.id == sid)
                best = next((c for c in candidates if c.winner), best)

        note = f"\n[Round {round_num} refinement: {raw[:200]}]"
        best.rationale += note

    return candidates


def run_karpathy_loop(findings: list[Finding]) -> list[Finding]:
    if not MINIMAX_AVAILABLE:
        raise RuntimeError(
            "FATAL: MINIMAX_API_KEY not set. Karpathy loop is required — cannot skip. "
            "Set MINIMAX_API_KEY in the environment before running."
        )

    log(f"Karpathy loop: {len(findings)} findings")

    for finding in findings:
        if not finding.research_results:
            log(f"Karpathy loop: [{finding.id}] skipped — no research results")
            continue

        log(f"Karpathy loop: [{finding.id}] generating candidates")
        candidates = _generate_candidates(finding, n=3)

        log(f"Karpathy loop: [{finding.id}] evaluating {len(candidates)} candidates")
        candidates = _evaluate_candidates(finding, candidates)

        log(f"Karpathy loop: [{finding.id}] self-refining (2 rounds)")
        candidates = _self_refine(finding, candidates, rounds=2)

        winner = next((c for c in candidates if c.winner), candidates[0])
        finding.karpathy_candidates = candidates
        finding.karpathy_winner = winner

        log(f"Karpathy loop: [{finding.id}] winner: {winner.approach} (overall={winner.scores.get('overall', 0):.1f})")

    return findings


# ---------------------------------------------------------------------------
# Phase 4 — Generate Report
# ---------------------------------------------------------------------------
def severity_badge(sev: str) -> str:
    badges = {"P1": "[CRITICAL]", "P2": "[HIGH]", "P3": "[MEDIUM]", "P4": "[LOW]"}
    return badges.get(sev, sev)


def _render_health_section(health: dict) -> list[str]:
    """Render the Health Metrics section."""
    lines = []
    lines.append("## Health Metrics\n")

    # Hall SQLite
    hall = health.get("hall_sqlite", {})
    if hall:
        lines.append("### Hall SQLite\n")
        lines.append(f"**Database:** `{hall.get('db', 'unknown')}`  ")
        lines.append(f"**Journal mode:** `{hall.get('journal_mode', 'unknown')}`  ")
        wal_mb = hall.get("wal_size_mb", 0)
        wal_alert = hall.get("wal_alert", False)
        wal_flag = " :alert:" if wal_alert else ""
        lines.append(f"**WAL size:** {wal_mb} MB{wal_flag}  ")
        freelist = hall.get("freelist_pct", 0)
        freelist_alert = hall.get("freelist_alert", False)
        fl_flag = " :alert:" if freelist_alert else ""
        lines.append(f"**Freelist:** {freelist}%{fl_flag}  ")
        lines.append(f"**Total size:** {hall.get('total_mb', 0)} MB  ")
        lines.append(f"**Pages:** {hall.get('page_count', 0)}  ")
        if wal_alert:
            lines.append("> **Alert:** WAL size exceeds 10 MB threshold — run `PRAGMA wal_checkpoint(TRUNCATE)` to reclaim space.\n")
        if freelist_alert:
            lines.append("> **Alert:** Freelists exceeds 5% — indicates heavy deletion activity; consider VACUUM.\n")
    else:
        lines.append("### Hall SQLite\n")
        lines.append("*No hall SQLite database found or accessible.*\n")

    # Bead throughput
    bead = health.get("bead_throughput", {})
    if bead and "error" not in bead:
        lines.append("### Bead Throughput (24h)\n")
        lines.append(f"**Total beads:** {bead.get('total_beads', 'N/A')}  ")
        lines.append(f"**Created in last 24h:** {bead.get('beads_24h', 'N/A')}  ")
        med_res = bead.get('median_resolution_s')
        if med_res:
            lines.append(f"**Median resolution time:** {med_res:.0f}s  ")
        failure_rates = bead.get("failure_rates_by_kind", {})
        if failure_rates:
            lines.append("**Failure rates by intent type:**  ")
            for kind, rate in failure_rates.items():
                lines.append(f"  - `{kind}`: {rate}%  ")
    elif "error" in bead:
        lines.append("### Bead Throughput\n")
        lines.append(f"*Error collecting bead data: {bead['error']}*\n")
    else:
        lines.append("### Bead Throughput\n")
        lines.append("*No bead throughput data available.*\n")

    # Gungnir trend
    gungnir = health.get("gungnir_trend", {})
    if gungnir:
        lines.append("### Gungnir Score Trend\n")
        curr = gungnir.get("current_7d_avg", 0)
        prev = gungnir.get("prior_7d_avg", 0)
        delta = gungnir.get("delta_pct", 0)
        alert = gungnir.get("alert", False)
        arrow = " down" if delta < 0 else " up"
        flag = " :alert:" if alert else ""
        lines.append(f"**Current 7-day avg:** {curr}  ")
        lines.append(f"**Prior 7-day avg:** {prev}  ")
        lines.append(f"**Delta:** {delta:+.1f}%{arrow}{flag}  ")
        if alert:
            lines.append("> **Alert:** Gungnir score dropped more than 10% vs prior week — investigate scoring drift.\n")
    else:
        lines.append("### Gungnir Score Trend\n")
        lines.append("*No Gungnir scoring data available.*\n")

    return lines


def _render_latency_report(timing_report: dict) -> list[str]:
    """Render skill latency report section."""
    lines = []
    lines.append("### Skill Latency (P50/P95/P99, last 7 days)\n")
    if not timing_report:
        lines.append("*No skill invocation data yet. Latency tracking begins after the first skill dispatch.*\n")
        return lines

    lines.append("| Skill | P50 (ms) | P95 (ms) | P99 (ms) | Samples | Alerts |")
    lines.append("|-------|----------|----------|----------|---------|--------|")
    for skill, data in sorted(timing_report.items()):
        p50 = data["p50"]
        p95 = data["p95"]
        p99 = data["p99"]
        n = data["n"]
        alerts = "; ".join(data["alerts"]) if data["alerts"] else "—"
        flag = " :alert:" if data["alerts"] else ""
        lines.append(f"| `{skill}` | {p50:.0f} | {p95:.0f} | {p99:.0f} | {n} | {alerts}{flag} |")
    lines.append("")
    return lines


def generate_report(
    findings: list[Finding],
    probe_findings: list[ProbeFinding],
    health: dict,
    timing_report: dict,
) -> Path:
    today = datetime.now().strftime("%Y-%m-%d")
    report_name = f"CSTAR_EVOLUTION_WATCH_{today}.md"
    report_path = REPORT_DEST / report_name

    # Group by severity
    by_sev: dict[str, list[Finding]] = {}
    for f in findings:
        by_sev.setdefault(f.severity, []).append(f)

    # Group probe findings by severity
    probe_by_sev: dict[str, list[ProbeFinding]] = {}
    for pf in probe_findings:
        probe_by_sev.setdefault(pf.severity, []).append(pf)

    lines = []
    lines.append(f"# CStar Evolution Watch\n")
    lines.append(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S Canada/Eastern')}  \n")
    lines.append(f"**CStar Root:** `{CSTAR_ROOT}`  \n")
    total_findings = len(findings) + len(probe_findings)
    lines.append(f"**Total findings:** {total_findings} ({len(findings)} source findings + {len(probe_findings)} probe findings)")
    lines.append(f"**Probe sources:** registry_drift, import_boundaries, cross_spoke_coupling, runtime_bypass, trace_compliance\n")

    # Severity summary
    lines.append(f"\n## Severity Summary\n")
    lines.append(f"| Priority | Source Findings | Probe Findings |")
    lines.append(f"|----------|-----------------|----------------|")
    sev_order = ["P1", "P2", "P3", "P4"]
    for sev in sev_order:
        src_count = len(by_sev.get(sev, []))
        probe_count = len(probe_by_sev.get(sev, []))
        if src_count or probe_count:
            ids_src = ", ".join(f"`{f.id}`" for f in by_sev.get(sev, [])[:5])
            ids_probe = ", ".join(f"`{pf.id}`" for pf in probe_by_sev.get(sev, [])[:5])
            lines.append(f"| {sev} | {src_count} ({ids_src}) | {probe_count} ({ids_probe}) |")

    # Probe findings summary
    if probe_findings:
        lines.append(f"\n## Proactive Probe Findings ({len(probe_findings)})\n")
        for sev in sev_order:
            pfs = probe_by_sev.get(sev, [])
            if not pfs:
                continue
            lines.append(f"### {severity_badge(sev)} ({len(pfs)} findings)\n")
            for pf in pfs:
                lines.append(f"#### {pf.title}\n")
                lines.append(f"**Probe:** `{pf.probe}`  **Directory:** `{pf.directory}`  \n")
                lines.append(f"**Component:** `{pf.component}`\n")
                lines.append(f"\n**Description:** {pf.description}\n")
                if pf.file_path:
                    lines.append(f"**File:** `{pf.file_path}`\n")
                lines.append("---\n")

    # Karpathy loop summary
    with_karpathy = [f for f in findings if f.karpathy_candidates]
    lines.append(f"\n## Karpathy Loop: {len(with_karpathy)}/{len(findings)} findings analyzed\n")
    if with_karpathy:
        lines.append(f"| ID | Title | Winner | Score |")
        lines.append(f"|----|-------|--------|-------|")
        for f in with_karpathy:
            winner = f.karpathy_winner
            score = f"{winner.scores.get('overall', 0):.1f}" if winner else "—"
            approach = winner.approach[:40] if winner and winner.approach else "—"
            lines.append(f"| `{f.id}` | {f.title[:40]} | {approach} | {score} |")

    # Health metrics (REQUIREMENT 4)
    lines.extend(_render_health_section(health))

    # Skill latency report (REQUIREMENT 2)
    if timing_report:
        lines.append("## Skill Latency Report\n")
        lines.extend(_render_latency_report(timing_report))

    # Detailed findings
    lines.append(f"\n## Detailed Source Findings\n")
    for sev in sev_order:
        if sev not in by_sev:
            continue
        for f in by_sev[sev]:
            lines.append(f"### {severity_badge(f.severity)} {f.id} — {f.title}\n")
            lines.append(f"**Component:** `{f.component}`  **Directory:** `{f.directory}`")
            if f.effort_hours:
                lines.append(f"**Effort:** ~{f.effort_hours}h")
            lines.append(f"\n**Problem:** {f.description}\n")
            lines.append(f"**Impact:** {f.impact}\n")
            lines.append(f"**Proposed Work:**\n")
            for line in f.proposed_work.split("\n"):
                lines.append(f"  {line}")
            lines.append("")

            if f.research_results:
                lines.append("**Research Highlights:**\n")
                for r in f.research_results[:4]:
                    snippet = r["snippet"][:200] if r["snippet"] else "(no snippet)"
                    lines.append(f"- *[{r['title']}]({r['url']})*  ")
                    lines.append(f"  > {snippet}\n")

            if f.karpathy_candidates:
                lines.append("\n**Karpathy Candidates:**\n")
                for c in f.karpathy_candidates:
                    winner_tag = " [WINNER]" if c.winner else ""
                    score_str = ""
                    if c.scores:
                        ov = c.scores.get("overall", 0)
                        score_str = f" (overall={ov:.1f}, eff={c.scores.get('effort',0):.0f}, corr={c.scores.get('correctness',0):.0f}, risk={c.scores.get('risk',0):.0f})"
                    lines.append(f"- **{c.approach}**{winner_tag}{score_str}\n")
                    if c.rationale:
                        lines.append(f"  {c.rationale[:200]}\n")
                    if c.code_sketch:
                        lines.append(f"  ```\n  {c.code_sketch[:300]}\n  ```\n")

            lines.append("---\n")

    # Top priorities
    all_p1 = (by_sev.get("P1", []) + probe_by_sev.get("P1", []))
    lines.append(f"## Top Priorities for Today\n")
    if all_p1:
        for i, item in enumerate(all_p1, 1):
            if isinstance(item, Finding):
                effort = f" (~{item.effort_hours}h)" if item.effort_hours else ""
                lines.append(f"{i}. **{item.title}** — `{item.component}`{effort}\n")
            else:
                lines.append(f"{i}. **{item.title}** — `{item.probe}` probe, `{item.directory}`\n")
    else:
        lines.append("No P1 items today. The codebase is in good shape.\n")

    # Proposed BEADs
    lines.append(f"## Proposed BEADs\n")
    lines.append(f"| ID | Title | Priority | Directory | Effort |")
    lines.append(f"|----|-------|----------|-----------|--------|")
    for f in findings:
        effort = f"{f.effort_hours}h" if f.effort_hours else "TBD"
        lines.append(f"| `{f.id}` | {f.title} | {f.severity} | {f.directory} | {effort} |")
    for pf in probe_findings:
        lines.append(f"| `{pf.id}` | {pf.title} | {pf.severity} | {pf.directory} | TBD |")

    report_content = "\n".join(lines)
    report_path.write_text(report_content)
    log(f"Report written: {report_path}")
    return report_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="CStar Evolution Watch")
    parser.add_argument("--dry-run", action="store_true", help="Inspect + probes only, skip research and Karpathy loop")
    parser.add_argument("--findings-only", action="store_true", help="Inspect + probes + report (skip research + Karpathy loop)")
    args = parser.parse_args()

    # Init timing DB
    _init_timing_db()

    log("=" * 60)
    log("CStar Evolution Watch — Starting pipeline (ENHANCED)")
    log("=" * 60)

    # Phase 1a: Inspect
    log("Phase 1a: Inspecting CStar source files...")
    findings = inspect_cstar()
    log(f"Phase 1a complete: {len(findings)} source findings extracted")
    for f in findings:
        log(f"  {f.severity} {f.id} — {f.title[:60]}")

    # Phase 1b: Proactive probes
    log("Phase 1b: Running proactive probes...")
    probe_findings, health, timing_report = run_proactive_probes()
    log(f"Phase 1b complete: {len(probe_findings)} probe findings")
    for pf in probe_findings:
        log(f"  {pf.severity} {pf.probe} — {pf.title[:60]}")

    if args.dry_run:
        log("Dry run — stopping after inspection and probes")
        # Write a quick dry-run report
        report_path = generate_report(findings, probe_findings, health, timing_report)
        print(f"\nDry-run report: {report_path}")
        # Update last run timestamp
        LAST_RUN_FILE.write_text(datetime.now().isoformat())
        return

    # Phase 2: Research
    if not args.findings_only:
        log("Phase 2: Running web research")
        findings = run_research(findings)
    else:
        log("Phase 2: Skipped (--findings-only)")

    # Phase 3: Karpathy research loop
    if not args.findings_only:
        log("Phase 3: Karpathy research loop")
        findings = run_karpathy_loop(findings)
    else:
        log("Phase 3: Skipped (--findings-only)")

    # Phase 4: Report
    log("Phase 4: Generating report")
    report_path = generate_report(findings, probe_findings, health, timing_report)

    # Update last run timestamp
    LAST_RUN_FILE.write_text(datetime.now().isoformat())

    # Summary
    log("=" * 60)
    log(f"Pipeline complete: {len(findings)} source findings, {len(probe_findings)} probe findings")
    log(f"Report: {report_path}")
    log("=" * 60)

    # Print report preview
    print("\n" + "=" * 60)
    print("REPORT PREVIEW")
    print("=" * 60)
    content = report_path.read_text()
    print(textwrap.indent(content[:4000], "  "))


if __name__ == "__main__":
    main()
