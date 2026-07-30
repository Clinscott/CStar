#!/usr/bin/env python3
"""Emit a read-only, secret-free Git closeout snapshot as JSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


class CloseoutInspectionError(RuntimeError):
    pass


def _git(root: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        check=False,
        capture_output=True,
    )
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise CloseoutInspectionError(message or f"git {' '.join(args)} failed")
    return result.stdout


def _nul_paths(raw: bytes) -> list[str]:
    return sorted(
        item.decode("utf-8", errors="surrogateescape")
        for item in raw.split(b"\0")
        if item
    )


def _contained_file(root: Path, requested: str) -> Path:
    candidate = (root / requested).absolute() if not Path(requested).is_absolute() else Path(requested).absolute()
    resolved_root = root.resolve(strict=True)
    resolved = candidate.resolve(strict=True)
    if not resolved.is_relative_to(resolved_root):
        raise CloseoutInspectionError(f"included path escapes repository: {requested}")
    if candidate.is_symlink() or not resolved.is_file():
        raise CloseoutInspectionError(f"included path must be a regular non-symlink file: {requested}")
    return resolved


def inspect(root: Path, include_paths: list[str]) -> dict[str, object]:
    root = root.resolve(strict=True)
    if not (root / ".git").exists():
        _git(root, "rev-parse", "--git-dir")

    staged = _nul_paths(_git(root, "diff", "--cached", "--name-only", "-z"))
    unstaged = _nul_paths(_git(root, "diff", "--name-only", "-z"))
    untracked = _nul_paths(_git(root, "ls-files", "--others", "--exclude-standard", "-z"))
    conflicts = _nul_paths(_git(root, "diff", "--name-only", "--diff-filter=U", "-z"))
    hashes: dict[str, str] = {}
    for requested in include_paths:
        pathname = _contained_file(root, requested)
        relative = pathname.relative_to(root).as_posix()
        hashes[relative] = hashlib.sha256(pathname.read_bytes()).hexdigest()

    return {
        "schema_version": 1,
        "root": str(root),
        "head": _git(root, "rev-parse", "HEAD").decode().strip(),
        "branch": _git(root, "branch", "--show-current").decode().strip() or None,
        "staged_paths": staged,
        "unstaged_paths": unstaged,
        "untracked_paths": untracked,
        "conflict_paths": conflicts,
        "dirty_path_count": len(set(staged + unstaged + untracked + conflicts)),
        "included_sha256": hashes,
        "mutation_performed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--include-path", action="append", default=[])
    args = parser.parse_args()
    print(json.dumps(inspect(args.root, args.include_path), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
