#!/usr/bin/env python3
"""Bounded Corvus Forge worker adapter.

This adapter is intentionally small: it asks the existing Hermes/MiniMax
delegate for a strict JSON file manifest, validates every claimed write against
the sealed CStar intent, writes only inside authorized target roots, and emits
the standard Forge execution response packet to payload.write_to.

It is not a Codex-worker fallback and it does not commit, push, merge, deploy,
read secrets, collect live sources, or write Hall/SQLite directly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("JSON root must be an object")
    return data


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_path(root: Path, value: str) -> Path:
    candidate = Path(os.path.expanduser(value))
    if not candidate.is_absolute():
        candidate = root / candidate
    return candidate.resolve()


def authorized_scopes(project_root: Path, target_paths: list[str]) -> list[tuple[str, Path]]:
    scopes: list[tuple[str, Path]] = []
    for raw in target_paths:
        candidate = resolve_path(project_root, raw)
        if candidate.exists() and candidate.is_file():
            scopes.append(("file", candidate.resolve()))
        elif candidate.exists() and candidate.is_dir():
            scopes.append(("dir", candidate.resolve()))
        elif candidate.suffix:
            scopes.append(("file", candidate.resolve()))
        else:
            scopes.append(("dir", candidate.resolve()))
    return scopes or [("dir", project_root.resolve())]


def is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def ensure_authorized(path: Path, scopes: list[tuple[str, Path]]) -> None:
    resolved = path.resolve()
    for kind, scope_path in scopes:
        if kind == "file" and resolved == scope_path:
            return
        if kind == "dir" and is_relative_to(resolved, scope_path):
            return
    raise ValueError(f"path outside authorized target roots: {path}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_model_json(raw: str) -> dict[str, Any]:
    stripped = raw.strip()
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        data = None
    if isinstance(data, dict):
        return data

    candidates: list[str] = []
    for start, char in enumerate(stripped):
        if char != "{":
            continue
        depth = 0
        for end in range(start, len(stripped)):
            if stripped[end] == "{":
                depth += 1
            elif stripped[end] == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(stripped[start:end + 1])
                    break
    for candidate in reversed(candidates):
        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            continue
    raise ValueError("model response was not a JSON object")


def model_manifest_from_delegate(intent: dict[str, Any], project_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    override = os.environ.get("CSTAR_FORGE_WORKER_MODEL_RESPONSE")
    if override:
        return extract_model_json(Path(override).read_text(encoding="utf-8")), {
            "status": "ok",
            "intent_id": "test-override",
            "duration_ms": 0,
            "response_chars": Path(override).stat().st_size,
            "est_prompt_tokens": 0,
            "est_response_tokens": 0,
            "model": intent["payload"]["model"],
            "hermes_profile": intent["payload"]["hermes_profile"],
            "ledger_entry": None,
            "live_spend": False,
            "live_source_collection": False,
        }

    delegate_script = Path(os.environ.get(
        "CSTAR_FORGE_WORKER_DELEGATE_SCRIPT",
        Path(__file__).resolve().parents[2] / "autobot" / "scripts" / "delegate.py",
    )).resolve()
    if not delegate_script.is_file():
        raise ValueError(f"delegate script not found: {delegate_script}")

    with tempfile.TemporaryDirectory(prefix="cstar-forge-worker-") as tmp:
        tmp_path = Path(tmp)
        model_response = tmp_path / "model-response.json"
        worker_manifest_contract = "\n\n".join([
            "Forge worker manifest contract:",
            "Return the worker input manifest, not the final Forge execution packet.",
            "Return JSON only with fields: status, summary, files, artifacts, validation, metrics, boundaries, callback_packet.",
            "files must be an array. Each files entry must be an object with path and content strings.",
            "content must be the complete file contents to write.",
            "Do not return files_changed. The worker creates files_changed after it writes and hashes files.",
            "Do not claim files you do not provide.",
        ])
        final_packet_markers = (
            "Your JSON response will be persisted by the adapter at:",
            "The top-level object MUST be the Forge execution packet.",
            "Do not return packet_name.",
            "For report-only work with no file edits,",
            "Include \"callback_packet\" as the compact callback payload",
            "Return JSON only with: status, summary, files_changed",
        )
        base_intent = "\n".join(
            line for line in str(intent["intent"]).splitlines()
            if not any(line.startswith(marker) for marker in final_packet_markers)
        )
        worker_guard = "\n\n".join([
            "Forge worker execution guard:",
            "Do not write files directly.",
            "Do not run shell commands.",
            "Do not create directories or mutate the workspace yourself.",
            "Your only output is the strict JSON worker manifest described below.",
            "The adapter will validate the manifest and perform all bounded writes.",
        ])
        delegate_intent = {
            "intent": base_intent + "\n\n" + worker_guard + "\n\n" + worker_manifest_contract,
            "project_root": str(project_root),
            "target_paths": intent.get("target_paths", []),
            "payload": {
                "hermes_profile": intent["payload"]["hermes_profile"],
                "model": intent["payload"]["model"],
                "expected_output": "json",
                "max_chars": max(int(intent["payload"].get("max_chars", 8000)), 24000),
                "write_to": str(model_response),
                "append_with_separator": None,
                "tags": list(intent["payload"].get("tags", [])) + ["corvus-forge-worker"],
                "timeout_seconds": intent["payload"].get("timeout_seconds", 600),
            },
        }
        delegate_intent_path = tmp_path / "delegate-intent.json"
        write_json(delegate_intent_path, delegate_intent)
        env = {
            **os.environ,
            "HERMES_AUTOBOT_DELEGATED": "",
        }
        proc = subprocess.run(
            ["python3", str(delegate_script), "--intent-file", str(delegate_intent_path)],
            cwd=str(project_root),
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=int(delegate_intent["payload"]["timeout_seconds"]) + 30,
            check=False,
        )
        envelope = extract_model_json(proc.stdout) if proc.stdout.strip() else {}
        if proc.returncode != 0 or envelope.get("status") != "ok":
            raise ValueError(f"delegate failed: rc={proc.returncode} status={envelope.get('status')} stderr={proc.stderr[-300:]}")
        if not model_response.is_file():
            raise ValueError("delegate did not write model response")
        return extract_model_json(model_response.read_text(encoding="utf-8")), envelope


def normalize_file_entries(manifest: dict[str, Any]) -> list[dict[str, str]]:
    files = manifest.get("files")
    if "files" not in manifest and "files_changed" in manifest:
        raise ValueError("model manifest used files_changed; expected files array with path/content objects")
    if not isinstance(files, list):
        raise ValueError("model manifest files must be an array")
    normalized: list[dict[str, str]] = []
    for index, entry in enumerate(files):
        if not isinstance(entry, dict):
            raise ValueError(f"files[{index}] must be an object")
        raw_path = entry.get("path")
        content = entry.get("content")
        if not isinstance(raw_path, str) or not raw_path.strip():
            raise ValueError(f"files[{index}].path must be a non-empty string")
        if not isinstance(content, str):
            raise ValueError(f"files[{index}].content must be a string")
        normalized.append({"path": raw_path.strip(), "content": content})
    if not normalized:
        raise ValueError("model manifest must include at least one file")
    return normalized


def apply_files(project_root: Path, scopes: list[tuple[str, Path]], files: list[dict[str, str]]) -> list[dict[str, Any]]:
    changed: list[dict[str, Any]] = []
    for entry in files:
        target = resolve_path(project_root, entry["path"])
        ensure_authorized(target, scopes)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(entry["content"], encoding="utf-8")
        changed.append({
            "path": str(target),
            "bytes": target.stat().st_size,
            "sha256": sha256_file(target),
        })
    return changed


def build_response(
    manifest: dict[str, Any],
    changed: list[dict[str, Any]],
    delegate_envelope: dict[str, Any],
    intent: dict[str, Any],
    project_root: Path,
) -> dict[str, Any]:
    files_changed = [entry["path"] for entry in changed]
    return {
        "status": str(manifest.get("status") or "success"),
        "summary": str(manifest.get("summary") or f"Applied {len(changed)} bounded Forge file change(s)."),
        "files_changed": files_changed,
        "artifacts": {
            "changed_files": changed,
            **(manifest.get("artifacts") if isinstance(manifest.get("artifacts"), dict) else {}),
        },
        "validation": manifest.get("validation") if isinstance(manifest.get("validation"), (dict, list)) else {},
        "metrics": manifest.get("metrics") if isinstance(manifest.get("metrics"), (dict, list)) else {},
        "boundaries": {
            "project_root": str(project_root),
            "codex_worker_fallback_allowed": False,
            "live_source_collection": False,
            "direct_hall_sqlite_bypass": False,
            "git_mutation": False,
            "delegate_status": delegate_envelope.get("status"),
            "model": intent["payload"]["model"],
            **(manifest.get("boundaries") if isinstance(manifest.get("boundaries"), dict) else {}),
        },
        "callback_packet": manifest.get("callback_packet")
        if isinstance(manifest.get("callback_packet"), (str, dict))
        else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--intent-file", required=True)
    args = parser.parse_args()

    try:
        intent = load_json(Path(args.intent_file))
        project_root = resolve_path(Path.cwd(), str(intent["project_root"]))
        project_root.mkdir(parents=True, exist_ok=True)
        scopes = authorized_scopes(project_root, list(intent.get("target_paths", []) or []))
        manifest, delegate_envelope = model_manifest_from_delegate(intent, project_root)
        files = normalize_file_entries(manifest)
        changed = apply_files(project_root, scopes, files)
        response = build_response(manifest, changed, delegate_envelope, intent, project_root)
        write_to = intent["payload"].get("write_to")
        if not isinstance(write_to, str) or not write_to.strip():
            raise ValueError("payload.write_to is required")
        response_path = resolve_path(Path.cwd(), write_to)
        write_json(response_path, response)
        print(json.dumps({
            "status": "ok",
            "intent_id": os.environ.get("CSTAR_FORGE_EXECUTE_RECEIPT_ID"),
            "duration_ms": delegate_envelope.get("duration_ms"),
            "response_chars": response_path.stat().st_size,
            "est_prompt_tokens": delegate_envelope.get("est_prompt_tokens"),
            "est_response_tokens": delegate_envelope.get("est_response_tokens"),
            "model": intent["payload"]["model"],
            "hermes_profile": intent["payload"]["hermes_profile"],
            "wrote_to": str(response_path),
            "ledger_entry": delegate_envelope.get("ledger_entry"),
            "live_spend": delegate_envelope.get("live_spend", True),
            "live_source_collection": False,
        }))
        return 0
    except Exception as exc:
        print(json.dumps({
            "status": "degraded",
            "degraded_reason": str(exc),
            "live_spend": False,
            "live_source_collection": False,
        }))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
