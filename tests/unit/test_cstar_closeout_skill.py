from __future__ import annotations

import json
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SKILL = ROOT / ".agents" / "skills" / "cstar-closeout"
SCRIPT = SKILL / "scripts" / "inspect_closeout.py"
ACTIVATION_SCRIPT = SKILL / "scripts" / "inspect_codex_activation.py"


def _load_activation_module():
    spec = importlib.util.spec_from_file_location("cstar_activation_inspector", ACTIVATION_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _git(root: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True)


def test_closeout_inspection_is_read_only_and_exact(tmp_path: Path) -> None:
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "test@example.invalid")
    _git(tmp_path, "config", "user.name", "CStar Test")
    tracked = tmp_path / "tracked.txt"
    tracked.write_text("baseline\n", encoding="utf-8")
    _git(tmp_path, "add", "tracked.txt")
    _git(tmp_path, "commit", "-q", "-m", "baseline")
    tracked.write_text("changed\n", encoding="utf-8")
    (tmp_path / "new.txt").write_text("new\n", encoding="utf-8")
    before = subprocess.run(
        ["git", "-C", str(tmp_path), "status", "--porcelain=v1"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout

    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--root", str(tmp_path), "--include-path", "tracked.txt"],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    after = subprocess.run(
        ["git", "-C", str(tmp_path), "status", "--porcelain=v1"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout

    assert payload["mutation_performed"] is False
    assert payload["unstaged_paths"] == ["tracked.txt"]
    assert payload["untracked_paths"] == ["new.txt"]
    assert len(payload["included_sha256"]["tracked.txt"]) == 64
    assert after == before


def test_closeout_inspection_rejects_external_includes(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q")
    outside = tmp_path / "outside.txt"
    outside.write_text("secret\n", encoding="utf-8")

    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--root", str(repo), "--include-path", str(outside)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "escapes repository" in result.stderr


def test_closeout_skill_preserves_separate_git_and_activation_gates() -> None:
    text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    for phrase in (
        "Never run `git add .`",
        "Stage only after an explicit staging grant",
        "Commit only after an explicit commit grant",
        "Push is a separate operator gate",
        "SOURCE",
        "INSTALLED",
        "LIVE",
        "PRODUCTION",
        "inspect_codex_activation.py",
        "MARKETPLACE_CONFLICT",
    ):
        assert phrase in text


def test_activation_inspector_is_read_only_and_detects_duplicate_marketplaces(tmp_path: Path) -> None:
    module = _load_activation_module()
    root = tmp_path / "Corvus" / "CStar"
    home = tmp_path / "home"
    estate = root.parent
    source_plugin = ROOT / "plugins" / "corvus-star"
    staged_plugin = home / "plugins" / "corvus-star"
    cached_plugin = home / ".codex" / "plugins" / "cache" / "corvus-local" / "corvus-star" / "1.0.1"
    shutil.copytree(source_plugin, root / "plugins" / "corvus-star")
    shutil.copytree(source_plugin, staged_plugin)
    shutil.copytree(source_plugin, cached_plugin)
    wrapper = home / ".codex" / "bin" / "wsl" / "cstar-kernel-mcp-wrapper"
    wrapper.parent.mkdir(parents=True)
    wrapper.write_text(f"exec node {root / 'bin' / 'cstar-kernel-mcp.js'} \"$@\"\n", encoding="utf-8")
    (root / "bin").mkdir(parents=True)
    (root / "bin" / "cstar-kernel-mcp.js").write_text("// fixture\n", encoding="utf-8")

    def runner(_cwd: Path, args: tuple[str, ...]):
        if args[:3] == ("plugin", "marketplace", "list"):
            return {"marketplaces": [
                {"name": "corvus-local", "root": str(home)},
                {"name": "corvus-local", "root": str(home / ".codex" / "plugins" / "cache" / "corvus-local")},
            ]}
        if args[:2] == ("plugin", "list"):
            return {"installed": [{
                "name": "corvus-star",
                "marketplaceName": "corvus-local",
                "version": "1.0.1",
            }]}
        if args[:2] == ("mcp", "list"):
            return [{
                "name": "cstar-kernel",
                "transport": {"type": "stdio", "command": str(wrapper)},
            }]
        raise AssertionError(args)

    before = sorted(path.relative_to(tmp_path) for path in tmp_path.rglob("*"))
    payload = module.inspect(root, home, estate, runner)
    after = sorted(path.relative_to(tmp_path) for path in tmp_path.rglob("*"))

    assert payload["source_ready"] is True
    assert payload["activation_static_ready"] is False
    assert payload["issues"] == ["corvus_local_marketplace_not_unique"]
    assert payload["live_proof_performed"] is False
    assert payload["mutation_performed"] is False
    assert after == before


def test_retired_launcher_smoke_cannot_write_state() -> None:
    assert not (ROOT / "scripts" / "codex_launcher_smoke.ts").exists()
    tombstone = (ROOT / "scripts" / "codex_launcher_smoke.DECOMMISSIONED.md").read_text(encoding="utf-8")
    assert "silently" in tombstone
    assert "cstar-closeout" in tombstone
