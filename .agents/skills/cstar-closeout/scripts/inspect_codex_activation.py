#!/usr/bin/env python3
"""Inspect Codex/CStar activation state without mutating host or repository state."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any


class ActivationInspectionError(RuntimeError):
    pass


CodexRunner = Callable[[Path, tuple[str, ...]], Any]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ActivationInspectionError(f"invalid JSON file: {path}") from error
    if not isinstance(value, dict):
        raise ActivationInspectionError(f"JSON root must be an object: {path}")
    return value


def _regular_files(root: Path) -> list[str]:
    files: list[str] = []
    for candidate in sorted(root.rglob("*")):
        if candidate.is_symlink():
            raise ActivationInspectionError(f"plugin tree contains a symlink: {candidate}")
        if candidate.is_file():
            files.append(candidate.relative_to(root).as_posix())
    return files


def _inspect_plugin(root: Path) -> dict[str, Any]:
    if not root.exists():
        return {"path": str(root), "exists": False, "lineage_valid": False}
    if root.is_symlink() or not root.is_dir():
        raise ActivationInspectionError(f"plugin root must be a real directory: {root}")

    manifest_path = root / ".codex-plugin" / "plugin.json"
    lineage_path = root / "lineage.json"
    manifest = _read_json(manifest_path)
    forbidden = [
        relative
        for relative in (".mcp.json", "hooks", "hooks.json", "scripts/cstar_codex_post_write.sh")
        if (root / relative).exists()
    ]
    result: dict[str, Any] = {
        "path": str(root),
        "exists": True,
        "name": manifest.get("name"),
        "version": manifest.get("version"),
        "skill_only": "mcpServers" not in manifest and "hooks" not in manifest and not forbidden,
        "forbidden_surfaces": forbidden,
        "lineage_valid": False,
    }
    if not lineage_path.exists():
        return result

    lineage = _read_json(lineage_path)
    files = lineage.get("files")
    plugin = lineage.get("plugin")
    runtime = lineage.get("runtime_binding")
    if not isinstance(files, dict) or not isinstance(plugin, dict) or not isinstance(runtime, dict):
        return result

    expected_files = sorted(str(relative) for relative in files)
    actual_files = [relative for relative in _regular_files(root) if relative != "lineage.json"]
    valid = (
        lineage.get("schema_version") == 1
        and plugin.get("name") == "corvus-star"
        and plugin.get("version") == manifest.get("version")
        and runtime.get("integration_mode") == "skill-only"
        and runtime.get("kernel_bundled") is False
        and expected_files == actual_files
        and result["skill_only"] is True
    )
    if valid:
        for relative in expected_files:
            record = files.get(relative)
            target = root / relative
            if not isinstance(record, dict) or not target.is_file() or target.is_symlink():
                valid = False
                break
            if record.get("bytes") != target.stat().st_size or record.get("sha256") != _sha256(target):
                valid = False
                break

    result.update({
        "lineage_valid": valid,
        "lineage_sha256": _sha256(lineage_path),
        "tool_count": (lineage.get("tool_catalog") or {}).get("count")
        if isinstance(lineage.get("tool_catalog"), dict) else None,
        "capability_count": (lineage.get("capability_exports") or {}).get("codex_count")
        if isinstance(lineage.get("capability_exports"), dict) else None,
    })
    return result


def _subprocess_codex_runner(codex_bin: str) -> CodexRunner:
    def run(cwd: Path, args: tuple[str, ...]) -> Any:
        completed = subprocess.run(
            [codex_bin, *args],
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip()
            raise ActivationInspectionError(
                f"read-only Codex command failed ({' '.join(args)}): {message[:500]}"
            )
        try:
            return json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            raise ActivationInspectionError(
                f"read-only Codex command returned invalid JSON: {' '.join(args)}"
            ) from error

    return run


def _cstar_mcp_command(payload: Any) -> str | None:
    if not isinstance(payload, list):
        return None
    for entry in payload:
        if not isinstance(entry, dict) or entry.get("name") != "cstar-kernel":
            continue
        transport = entry.get("transport")
        if isinstance(transport, dict) and transport.get("type") == "stdio":
            command = transport.get("command")
            return command if isinstance(command, str) else None
    return None


def inspect(
    root: Path,
    home: Path,
    estate_root: Path,
    runner: CodexRunner,
) -> dict[str, Any]:
    root = root.resolve(strict=True)
    home = home.resolve(strict=True)
    estate_root = estate_root.resolve(strict=True)
    source = _inspect_plugin(root / "plugins" / "corvus-star")
    staged = _inspect_plugin(home / "plugins" / "corvus-star")

    marketplace_payload = runner(home, ("plugin", "marketplace", "list", "--json"))
    plugin_payload = runner(home, ("plugin", "list", "--json"))
    marketplaces = marketplace_payload.get("marketplaces", []) if isinstance(marketplace_payload, dict) else []
    corvus_marketplaces = [
        entry for entry in marketplaces
        if isinstance(entry, dict) and entry.get("name") == "corvus-local"
    ]
    installed_entries = plugin_payload.get("installed", []) if isinstance(plugin_payload, dict) else []
    installed_corvus = [
        entry for entry in installed_entries
        if isinstance(entry, dict) and entry.get("name") == "corvus-star"
    ]

    installed_trees: list[dict[str, Any]] = []
    for entry in installed_corvus:
        marketplace_source = entry.get("marketplaceSource")
        marketplace_name = entry.get("marketplaceName")
        plugin_name = entry.get("name")
        version = entry.get("version")
        if not all(isinstance(value, str) for value in (marketplace_name, plugin_name, version)):
            continue
        candidates = {
            home / ".codex" / "plugins" / "cache" / marketplace_name / plugin_name / version,
        }
        if isinstance(marketplace_source, dict):
            cache_root = marketplace_source.get("source")
            if isinstance(cache_root, str) and Path(cache_root).is_absolute():
                candidates.add(Path(cache_root) / plugin_name / version)
        installed_trees.extend(
            _inspect_plugin(candidate)
            for candidate in sorted(candidates)
            if candidate.exists()
        )

    mcp_commands: dict[str, str | None] = {}
    for label, cwd in (("home", home), ("estate", estate_root), ("cstar", root)):
        mcp_commands[label] = _cstar_mcp_command(runner(cwd, ("mcp", "list", "--json")))

    expected_wrapper = home / ".codex" / "bin" / "wsl" / "cstar-kernel-mcp-wrapper"
    wrapper_ok = False
    if expected_wrapper.exists() and expected_wrapper.is_file() and not expected_wrapper.is_symlink():
        wrapper_text = expected_wrapper.read_text(encoding="utf-8", errors="replace")
        wrapper_ok = str(root / "bin" / "cstar-kernel-mcp.js") in wrapper_text

    expected_version = source.get("version")
    issues: list[str] = []
    if not source.get("lineage_valid"):
        issues.append("source_plugin_lineage_invalid")
    if staged.get("version") != expected_version or not staged.get("lineage_valid"):
        issues.append("personal_plugin_not_staged_from_source")
    if len(corvus_marketplaces) != 1:
        issues.append("corvus_local_marketplace_not_unique")
    if len(installed_corvus) != 1 or installed_corvus[0].get("version") != expected_version:
        issues.append("installed_plugin_version_mismatch")
    if len(installed_trees) != 1 or not installed_trees[0].get("lineage_valid"):
        issues.append("installed_plugin_lineage_invalid")
    if set(mcp_commands.values()) != {str(expected_wrapper)} or not wrapper_ok:
        issues.append("global_mcp_wrapper_lineage_mismatch")

    return {
        "schema_version": 1,
        "source": source,
        "personal_staging": staged,
        "marketplaces": {
            "corvus_local_count": len(corvus_marketplaces),
            "roots": sorted(
                str(entry.get("root")) for entry in corvus_marketplaces
                if entry.get("root") is not None
            ),
        },
        "installed": {
            "entries": installed_corvus,
            "trees": installed_trees,
        },
        "mcp_static_lineage": {
            "expected_wrapper": str(expected_wrapper),
            "commands_by_root": mcp_commands,
            "wrapper_binds_source_launcher": wrapper_ok,
        },
        "issues": issues,
        "source_ready": source.get("lineage_valid") is True,
        "activation_static_ready": not issues,
        "live_proof_performed": False,
        "operator_gate_required": True,
        "mutation_performed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--home", type=Path, default=Path.home())
    parser.add_argument("--estate-root", type=Path)
    parser.add_argument("--codex-bin", default="codex")
    args = parser.parse_args()
    estate_root = args.estate_root or args.root.parent
    payload = inspect(args.root, args.home, estate_root, _subprocess_codex_runner(args.codex_bin))
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload["activation_static_ready"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
