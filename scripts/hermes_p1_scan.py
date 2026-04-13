#!/usr/bin/env python3
"""
Hermes P1 Code Review Scan Workflow

Usage:
    python hermes_p1_scan.py <spoke_root>

Creates P1_SCAN beads for all crawlable source files in a spoke.
Each bead carries the file review instructions and metadata for Gemma.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

# Add CStar src to path for direct module imports
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.hall_schema import HallScanRecord, HallOfRecords


ALLOWED_EXTENSIONS = frozenset({'.js', '.ts', '.jsx', '.tsx', '.py', '.rs', '.go', '.java', '.cs'})
ACCEPTANCE_CRITERIA_TEMPLATE = """You are a senior code reviewer. Review the file at the path below.

RULES:
- Output ONLY valid JSON: {{"steps": [], "summary": "", "overall_score": float, "top_findings": []}}
- steps[]: {{"file": str, "line": int, "severity": "CRITICAL|HIGH|MEDIUM|LOW", "type": "security|bug|memory|race|architectural", "description": str}}
- summary: one-paragraph summary of the file's overall condition
- overall_score: 0.0-10.0 (10 = perfect)
- top_findings[]: brief plain-English descriptions of the 3 most important issues
- If no issues found, return overall_score 10.0 and empty steps array

Read the file, analyze it, and output your JSON review.
"""


def flatten_stats_path(absolute_path: str, project_root: str) -> str:
    """Convert absolute path to flattened .stats filename format."""
    rel = absolute_path.replace(project_root, '').lstrip('/')
    return rel.replace('/', '-').replace('\\', '-')


def collect_reviewable_files(spoke_root: str) -> list[str]:
    """Collect all source files eligible for code review from a spoke."""
    import os

    BLOAT = {
        'node_modules', '.git', '.stats', '.quarto', '__pycache__',
        '.pytest_cache', '.ruff_cache', 'dist', 'build', 'skills_db',
        'tmp_', 'temp_', '.agents', '.venv', 'venv', 'target', 'bin', 'obj',
    }

    results = []
    for root, dirs, files in os.walk(spoke_root):
        # Prune bloat directories in-place
        dirs[:] = [d for d in dirs if not any(p in os.path.join(root, d) for p in BLOAT)]

        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in ALLOWED_EXTENSIONS:
                results.append(os.path.join(root, file))

    return results


def hermes_p1_scan(spoke_root: str, spoke_slug: str | None = None) -> dict:
    """
    Execute Hermes P1 code review scan workflow.

    1. Create a P1_SCAN scan record in the Hall
    2. Collect all reviewable source files from the spoke
    3. Create one P1_SCAN bead per file
    4. Return summary of scan session
    """
    spoke_root = Path(spoke_root).resolve()
    if not spoke_root.exists():
        raise FileNotFoundError(f"Spoke root does not exist: {spoke_root}")

    slug = spoke_slug or spoke_root.name
    now_ms = int(time.time() * 1000)

    # Connect to Hall
    cstar_root = Path(__file__).parent.parent.parent / "CStar"
    hall = HallOfRecords(cstar_root)
    repo = hall.bootstrap_repository()
    scan_id = f"p1-scan:{now_ms}"

    # Create P1_SCAN scan record
    scan_record = HallScanRecord(
        scan_id=scan_id,
        repo_id=repo.repo_id,
        scan_kind="P1_SCAN",
        status="PENDING",
        baseline_gungnir_score=0.0,
        started_at=now_ms,
        completed_at=None,
        metadata={
            "spoke_slug": slug,
            "project_root": str(spoke_root),
            "master_report_path": f"docs/reports/{slug}-p1-scan.md",
            "god_file_path": f"docs/reports/{slug}-p1-scan-god.md",
        },
    )
    hall.record_scan(scan_record)

    # Collect files
    files = collect_reviewable_files(str(spoke_root))
    print(f"[Hermes P1] Found {len(files)} reviewable files in {slug}")

    # Create beads
    ledger = BeadLedger(cstar_root)
    created = 0
    skipped = 0

    for file_path in files:
        normalized = file_path.replace('\\', '/')
        stats_path = flatten_stats_path(normalized, str(spoke_root))
        filename = Path(normalized).name

        try:
            ledger.upsert_bead(
                scan_id=scan_id,
                target_kind="FILE",
                target_ref=normalized,
                target_path=normalized,
                rationale="P1 Code Review Scan",
                contract_refs=["workflow:p1_scan"],
                acceptance_criteria=ACCEPTANCE_CRITERIA_TEMPLATE,
                status="OPEN",
                source_kind="P1_SCAN",
                metadata={
                    "p1_scan": True,
                    "scan_kind": "P1_SCAN",
                    "spoke_slug": slug,
                    "project_root": str(spoke_root),
                    "master_report_path": f"docs/reports/{slug}-p1-scan.md",
                    "god_file_path": f"docs/reports/{slug}-p1-scan-god.md",
                    "filename": filename,
                    "stats_path": stats_path,
                    "scan_timestamp": now_ms,
                },
            )
            created += 1
        except Exception as e:
            print(f"[Hermes P1] Skipping {normalized}: {e}")
            skipped += 1

    return {
        "scan_id": scan_id,
        "spoke_slug": slug,
        "spoke_root": str(spoke_root),
        "files_discovered": len(files),
        "beads_created": created,
        "beads_skipped": skipped,
        "master_report": f"docs/reports/{slug}-p1-scan.md",
        "god_file": f"docs/reports/{slug}-p1-scan-god.md",
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python hermes_p1_scan.py <spoke_root> [spoke_slug]")
        sys.exit(1)

    spoke_root = sys.argv[1]
    spoke_slug = sys.argv[2] if len(sys.argv) > 2 else None

    result = hermes_p1_scan(spoke_root, spoke_slug)
    print("\n[Hermes P1] Scan session created:")
    print(json.dumps(result, indent=2))
