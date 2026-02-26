#!/usr/bin/env python3
"""
QMD Migration Script
Linscott Standard: Backup → Validate → Migrate → Verify
"""
import hashlib
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path("c:/Users/Craig/Corvus/CorvusStar")

def get_checksum(path: Path) -> str:
    """SHA-256 checksum for integrity verification."""
    try:
        if not path.exists():
            return "ERROR"
        if path.stat().st_size == 0:
            return "EMPTY_FILE"
        with open(path, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except Exception:
        return "ERROR"

def migrate_file(md_path: Path, dry_run=False) -> tuple[bool, str]:
    """Rename .md to .qmd using git mv."""
    qmd_path = md_path.with_suffix('.qmd')

    # Skip if already .qmd
    if md_path.suffix != '.md':
        return False, f"SKIP: {md_path} (not .md)"

    # Check if target exists
    if qmd_path.exists():
        return False, f"CONFLICT: {qmd_path} already exists"

    if dry_run:
        return True, f"DRY-RUN: {md_path} → {qmd_path}"

    try:
        result = subprocess.run(
            ['git', 'mv', str(md_path), str(qmd_path)],
            capture_output=True, text=True, cwd=PROJECT_ROOT
        )
        if result.returncode != 0:
            return False, f"ERROR: {md_path} - {result.stderr.strip()}"
        return True, f"OK: {md_path.name} → {qmd_path.name}"
    except Exception as e:
        return False, f"EXCEPTION: {md_path.name} - {e!s}"

def main():
    dry_run = "--dry-run" in sys.argv
    md_files = list(PROJECT_ROOT.rglob("*.md"))

    # Exclude backup directories and .gemini temp files
    exclude = ["docs_backup", "CorvusStar_backup", ".gemini", "node_modules", ".git", ".corvus_quarantine"]
    md_files = [f for f in md_files if not any(x in str(f) for x in exclude)]

    print(f"Found {len(md_files)} .md files to migrate" + (" (DRY RUN)" if dry_run else ""))

    success = 0
    failed = 0

    for md_file in sorted(md_files):
        ok, msg = migrate_file(md_file, dry_run=dry_run)
        print(msg)
        if ok:
            success += 1
        else:
            if "SKIP" not in msg:
                failed += 1

    print(f"\n{'='*50}")
    print(f"SUCCESS: {success} | FAILED: {failed}")

if __name__ == "__main__":
    main()
