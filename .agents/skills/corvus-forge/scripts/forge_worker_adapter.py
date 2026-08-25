#!/usr/bin/env python3
"""Bounded Forge worker: validate one sealed manifest and apply only authorized files."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys, tempfile
from pathlib import Path
from typing import Any, Callable
from forge_worker_safety import (
    apply_files,
    authorized_scopes,
    build_worker_manifest_contract,
    ensure_safe_write_target,
    ManifestPathContractError,
    minimal_subprocess_environment,
    RequiredOutputContractError,
    resolve_path,
    resolve_write_path,
    sealed_required_outputs,
    verify_package_locks,
    verify_runtime_file,
    write_response_json,
)
SUCCESS_STATUSES = {"accepted", "ok", "pass", "passed", "success", "succeeded"}
DELEGATE_FAILURE_SCHEMA = "cstar.forge_delegate_failure.v1"
SAFE_DELEGATE_REASON = re.compile(r"^forge_[a-z0-9_]+(?:_[0-9]+)?$")
EXPECTED_MANIFEST_FIELDS = set("status summary files artifacts validation metrics boundaries callback_packet".split())
class ManifestContractError(ValueError):
    def __init__(self, code: str, details: dict[str, Any] | None = None):
        super().__init__(code)
        self.code = code
        self.details = details or {}
class DelegateFailure(RuntimeError):
    def __init__(self, envelope: dict[str, Any]):
        super().__init__(str(envelope["degraded_reason"]))
        self.envelope = envelope
def bounded_delegate_failure(raw: dict[str, Any], fallback: str) -> dict[str, Any]:
    reason = raw.get("degraded_reason")
    if not isinstance(reason, str) or len(reason) > 120 or not SAFE_DELEGATE_REASON.fullmatch(reason):
        reason = fallback
    model_source = raw.get("model_source")
    model_source = model_source if model_source in {"unreported", "provider_reported"} else "unreported"
    actual_model = raw.get("actual_model")
    actual_reported = (model_source == "provider_reported" and isinstance(actual_model, str)
                       and re.fullmatch(r"[A-Za-z0-9._:/-]{1,80}", actual_model))
    if not actual_reported:
        actual_model = None
    spend = raw.get("live_spend") if isinstance(raw.get("live_spend"), bool) else None
    return {
        "schema": DELEGATE_FAILURE_SCHEMA, "degraded_reason": reason,
        "provider": "minimax", "requested_model": "MiniMax-M3",
        "actual_model": actual_model, "model_source": model_source,
        "hermes_profile": "cstar-hub", "live_spend": spend,
        "live_spend_unknown": raw.get("live_spend_unknown") is True or spend is None,
        "live_source_collection": raw.get("live_source_collection") is True,
    }
def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("JSON root must be an object")
    return data
def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
def json_type_name(value: Any) -> str:
    if value is None:
        return "null"
    for value_type, label in (
        (bool, "boolean"), (str, "string"), ((int, float), "number"),
        (list, "array"), (dict, "object"),
    ):
        if isinstance(value, value_type):
            return label
    return "unknown"
def classify_manifest_failure(error: Exception) -> str:
    if isinstance(error, (ManifestContractError, ManifestPathContractError)):
        return error.code
    message = str(error)
    for fragment, code in (
        ("duplicate file path", "duplicate_file_path"),
        ("missing required output paths", "missing_required_output"),
        ("outputs outside required_output_paths", "undeclared_output"),
        ("outside authorized target roots", "path_outside_authorized_scope"),
        ("write path outside project root", "path_outside_project"),
        ("write path contains symlink", "unsafe_symlink_path"),
        ("response target must be a unique regular file", "unsafe_response_target"),
        ("rollback incomplete", "rollback_incomplete"),
    ):
        if fragment in message:
            return code
    return "worker_application_failure"
def build_rejected_manifest_response(manifest: dict[str, Any], failure_class: str,
                                     intent: dict[str, Any], details: dict[str, Any]) -> dict[str, Any]:
    canonical = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"),
                           sort_keys=True).encode("utf-8")
    files = manifest.get("files")
    status = manifest.get("status")
    callback = manifest.get("callback_packet")
    expected_callback = str(intent.get("expected_callback_packet") or "").strip()
    known_status = isinstance(status, str) and status.strip().lower() in SUCCESS_STATUSES
    callback_matches = isinstance(callback, str) and callback.strip() == expected_callback
    return {
        "status": "rejected",
        "summary": "Forge worker manifest rejected before accepted delivery.",
        "files_changed": [],
        "artifacts": {
            "rejected_manifest": {
                "schema": "cstar.forge_rejected_manifest_evidence.v1",
                "sha256": hashlib.sha256(canonical).hexdigest(),
                "bytes": len(canonical),
                "failure_class": failure_class,
                **details,
                "top_level_field_count": len(manifest),
                "unknown_field_count": len(set(manifest) - EXPECTED_MANIFEST_FIELDS),
                "status": {"present": "status" in manifest, "type": json_type_name(status),
                           "recognized_success": known_status},
                "files": {"present": "files" in manifest, "type": json_type_name(files),
                          "count": len(files) if isinstance(files, list) else None},
                "callback_packet": {"present": "callback_packet" in manifest,
                                    "type": json_type_name(callback), "matches_expected": callback_matches},
                "raw_manifest_persisted": False,
                "raw_values_emitted": False,
            },
        },
        "validation": {"manifest_contract": "rejected"},
        "metrics": {"required_output_count": len(intent.get("required_output_paths", []) or []),
                    "reported_file_entry_count": len(files) if isinstance(files, list) else 0},
        "boundaries": {"project_file_writes": 0, "raw_manifest_persisted": False,
                       "raw_values_emitted": False, "live_source_collection": False,
                       "git_mutation": False},
        "callback_packet": expected_callback,
    }
def verify_runtime_contract(intent: dict[str, Any]) -> tuple[Path, Path]:
    runtime = intent.get("adapter_runtime")
    if not isinstance(runtime, dict):
        raise ValueError("sealed adapter runtime contract is required")
    adapter_proof = {"sha256": runtime.get("sha256"), "bytes": runtime.get("bytes"),
                     "owner_uid": os.getuid()}
    verify_runtime_file(Path(__file__), adapter_proof, "adapter")
    dependencies = runtime.get("dependencies")
    if not isinstance(dependencies, list):
        raise ValueError("sealed adapter dependencies are required")
    by_role = {
        str(item.get("role")): item
        for item in dependencies
        if isinstance(item, dict) and isinstance(item.get("role"), str)
    }
    safety_proof = by_role.get("forge_worker_safety")
    delegate_proof = by_role.get("hermes_minimax_delegate")
    if not safety_proof or not delegate_proof:
        raise ValueError("sealed worker dependency set is incomplete")
    safety_path = Path(__file__).resolve().parent / "forge_worker_safety.py"
    delegate_path = Path(__file__).resolve().parent / "hermes_minimax_delegate.mjs"
    # Materialized copies are owner-only even when the original proof was
    # rooted elsewhere, so bind their bytes to the original sealed hash.
    for proof in (safety_proof, delegate_proof):
        proof["owner_uid"] = os.getuid()
    verify_runtime_file(safety_path, safety_proof, "forge_worker_safety")
    verify_runtime_file(delegate_path, delegate_proof, "hermes_minimax_delegate")
    python_proof = runtime.get("python_interpreter")
    node_proof = runtime.get("node_interpreter")
    if not isinstance(python_proof, dict) or not isinstance(node_proof, dict):
        raise ValueError("sealed interpreter proofs are required")
    python_path = Path(str(python_proof.get("path") or ""))
    node_path = Path(str(node_proof.get("path") or ""))
    verify_runtime_file(python_path, python_proof, "python_interpreter")
    verify_runtime_file(node_path, node_proof, "node_interpreter")
    if Path(sys.executable).resolve() != python_path.resolve():
        raise ValueError("running Python interpreter does not match sealed runtime")
    return node_path, delegate_path
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

def model_manifest_from_delegate(
    intent: dict[str, Any], project_root: Path, node_interpreter: Path,
    delegate_script: Path, worker_manifest_contract: str,
    before_delegate: Callable[[], None],
) -> tuple[dict[str, Any], dict[str, Any]]:
    override = os.environ.get("CSTAR_FORGE_WORKER_MODEL_RESPONSE")
    if override:
        if not os.environ.get("NODE_TEST_CONTEXT") or os.environ.get("CSTAR_FORGE_TEST_MODE") != "1":
            raise ValueError("CSTAR_FORGE_WORKER_MODEL_RESPONSE is test-only")
        return extract_model_json(Path(override).read_text(encoding="utf-8")), {
            "status": "ok",
            "intent_id": "test-override",
            "duration_ms": 0,
            "response_chars": Path(override).stat().st_size,
            "est_prompt_tokens": 0,
            "est_response_tokens": 0,
            "model": intent["payload"]["model"],
            "provider": "minimax",
            "requested_model": intent["payload"]["model"],
            "actual_model": None,
            "model_source": "unreported",
            "hermes_profile": intent["payload"]["hermes_profile"],
            "ledger_entry": None,
            "live_spend": False,
            "live_source_collection": False,
        }
    if not delegate_script.is_file():
        raise ValueError(f"delegate script not found: {delegate_script}")
    delegate_stat = delegate_script.stat()
    if delegate_stat.st_uid != os.getuid() or delegate_stat.st_mode & 0o022:
        raise ValueError(f"delegate script is not owner-only writable: {delegate_script}")
    if delegate_script.suffix != ".mjs":
        raise ValueError(f"Forge delegate must be a Node .mjs runtime: {delegate_script}")
    with tempfile.TemporaryDirectory(prefix="cstar-forge-worker-", dir="/tmp" if sys.platform.startswith("linux") else None) as tmp:
        tmp_path = Path(tmp)
        model_response = tmp_path / "model-response.json"
        final_packet_markers = (
            "Your JSON response will be persisted by the adapter at:",
            "The top-level object MUST be the Forge execution packet.",
            "Do not return packet_name.",
            "For report-only work with no file edits,",
            "Include \"callback_packet\" as the compact callback payload",
            "Return JSON only with: status, summary, files_changed",
            "Every required output path must be present exactly once:",
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
            "hermes_preflight": intent.get("hermes_preflight"),
            "payload": {
                "hermes_profile": intent["payload"]["hermes_profile"],
                "model": intent["payload"]["model"],
                "expected_output": "json",
                "max_chars": max(int(intent["payload"].get("max_chars", 8000)), 60000),
                "write_to": str(model_response),
                "append_with_separator": None,
                "tags": list(intent["payload"].get("tags", [])) + ["corvus-forge-worker"],
                "timeout_seconds": intent["payload"].get("timeout_seconds", 600),
            },
        }
        delegate_intent_path = tmp_path / "delegate-intent.json"
        write_json(delegate_intent_path, delegate_intent)
        env = minimal_subprocess_environment({"CSTAR_FORGE_HERMES_DELEGATED": ""})
        before_delegate()
        proc = subprocess.run(
            [str(node_interpreter), str(delegate_script), "--intent-file", str(delegate_intent_path)],
            cwd=str(project_root),
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=int(delegate_intent["payload"]["timeout_seconds"]) + 30,
            check=False,
        )
        try:
            envelope = extract_model_json(proc.stdout) if proc.stdout.strip() else {}
        except ValueError:
            envelope = {}
        if proc.returncode != 0:
            raise DelegateFailure(bounded_delegate_failure(
                envelope, "forge_hermes_delegate_exit_nonzero",
            ))
        if envelope.get("status") != "ok":
            raise DelegateFailure(bounded_delegate_failure(
                envelope, "forge_hermes_delegate_status_not_ok",
            ))
        if not model_response.is_file():
            raise ValueError("delegate did not write model response")
        return extract_model_json(model_response.read_text(encoding="utf-8")), envelope
def normalize_file_entries(manifest: dict[str, Any]) -> list[dict[str, str]]:
    status = str(manifest.get("status") or "").strip().lower()
    if not status:
        raise ManifestContractError("status_missing")
    if status not in SUCCESS_STATUSES:
        raise ManifestContractError("status_non_success")
    files = manifest.get("files")
    if "files" not in manifest and "files_changed" in manifest:
        raise ManifestContractError("files_changed_legacy")
    if not isinstance(files, list):
        raise ManifestContractError("files_not_array")
    normalized: list[dict[str, str]] = []
    for index, entry in enumerate(files):
        if not isinstance(entry, dict):
            raise ManifestContractError("file_entry_invalid", {"invalid_entry_indexes": [index]})
        raw_path = entry.get("path")
        content = entry.get("content")
        if not isinstance(raw_path, str) or not raw_path.strip():
            raise ManifestContractError("file_path_invalid")
        if not isinstance(content, str):
            raise ManifestContractError("file_content_invalid")
        normalized.append({"path": raw_path, "content": content})
    if not normalized:
        raise ManifestContractError("files_empty")
    return normalized
def validate_callback_packet(manifest: dict[str, Any], expected: str) -> None:
    callback = manifest.get("callback_packet")
    if isinstance(callback, str):
        actual = callback.strip()
    elif isinstance(callback, dict):
        actual = str(callback.get("callback_id") or callback.get("packet_name") or callback.get("name") or "").strip()
    else:
        actual = ""
    if not actual:
        raise ManifestContractError("callback_missing")
    if not expected or actual != expected:
        raise ManifestContractError("callback_mismatch")

def build_response(manifest: dict[str, Any], changed: list[dict[str, Any]],
                   delegate_envelope: dict[str, Any], intent: dict[str, Any],
                   project_root: Path) -> dict[str, Any]:
    files_changed = [entry["path"] for entry in changed]
    reported_artifacts = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), (dict, list)) else {}
    reported_artifacts_sha256 = hashlib.sha256(
        json.dumps(reported_artifacts, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "status": "success",
        "summary": str(manifest.get("summary") or f"Applied {len(changed)} bounded Forge file change(s)."),
        "files_changed": files_changed,
        "artifacts": {
            "changed_files": changed,
            "model_artifact_claims_sha256": reported_artifacts_sha256,
        },
        "validation": manifest.get("validation") if isinstance(manifest.get("validation"), (dict, list)) else {},
        "metrics": manifest.get("metrics") if isinstance(manifest.get("metrics"), (dict, list)) else {},
        "boundaries": {
            **(manifest.get("boundaries") if isinstance(manifest.get("boundaries"), dict) else {}),
            "project_root": str(project_root),
            "codex_worker_fallback_allowed": False,
            "live_source_collection": False,
            "direct_hall_sqlite_bypass": False,
            "git_mutation": False,
            "delegate_status": delegate_envelope.get("status"),
            "model": intent["payload"]["model"],
        },
        "callback_packet": str(intent["expected_callback_packet"]),
    }
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--intent-file", required=True)
    args = parser.parse_args()
    model_invocation_started = False
    model_invocation_can_spend = False
    observed_live_spend: bool | None = None
    intent: dict[str, Any] | None = None
    manifest: dict[str, Any] | None = None
    delegate_envelope: dict[str, Any] = {}
    response_path: Path | None = None
    try:
        intent = load_json(Path(args.intent_file))
        project_root = resolve_path(Path.cwd(), str(intent["project_root"]))
        if not project_root.is_dir() or project_root.is_symlink():
            raise ValueError("project_root must be an existing non-symlink directory")
        project_stat = project_root.lstat()
        if project_stat.st_uid != os.getuid() or project_stat.st_mode & 0o022:
            raise ValueError("project_root must be owner-controlled and not group/world writable")
        node_interpreter, delegate_script = verify_runtime_contract(intent)
        scopes = authorized_scopes(project_root, list(intent.get("target_paths", []) or []))
        raw_required_outputs = intent.get("required_output_paths")
        if not isinstance(raw_required_outputs, list):
            raise RequiredOutputContractError("required_output_path_invalid_type")
        required_output_paths = list(raw_required_outputs)
        try:
            for target, _display in sealed_required_outputs(project_root, required_output_paths):
                ensure_safe_write_target(project_root, target, scopes)
            worker_manifest_contract = build_worker_manifest_contract(project_root, required_output_paths)
        except RequiredOutputContractError:
            raise
        except Exception as exc:
            raise RequiredOutputContractError("required_output_path_not_authorized") from exc
        write_to = intent["payload"].get("write_to")
        if not isinstance(write_to, str) or not write_to.strip():
            raise ValueError("payload.write_to is required")
        response_path = resolve_write_path(Path.cwd(), write_to)
        verify_package_locks(intent, Path.cwd())
        def mark_model_invocation_started() -> None:
            nonlocal model_invocation_started, model_invocation_can_spend
            model_invocation_started = True
            model_invocation_can_spend = True

        manifest, delegate_envelope = model_manifest_from_delegate(
            intent, project_root, node_interpreter, delegate_script,
            worker_manifest_contract, mark_model_invocation_started,
        )
        if isinstance(delegate_envelope.get("live_spend"), bool):
            observed_live_spend = delegate_envelope["live_spend"]
        files = normalize_file_entries(manifest)
        expected_callback = str(intent.get("expected_callback_packet") or "").strip()
        validate_callback_packet(manifest, expected_callback)

        def persist_validated_response(changed_files: list[dict[str, Any]]) -> None:
            response = build_response(manifest, changed_files, delegate_envelope, intent, project_root)
            write_response_json(response_path, response)

        changed = apply_files(project_root, scopes, files, required_output_paths,
                              persist_validated_response)
        print(json.dumps({
            "status": "ok", "intent_id": os.environ.get("CSTAR_FORGE_EXECUTE_RECEIPT_ID"),
            "duration_ms": delegate_envelope.get("duration_ms"), "response_chars": response_path.stat().st_size,
            "est_prompt_tokens": delegate_envelope.get("est_prompt_tokens"),
            "est_response_tokens": delegate_envelope.get("est_response_tokens"), "model": intent["payload"]["model"],
            "provider": delegate_envelope.get("provider", "minimax"),
            "requested_model": delegate_envelope.get("requested_model", intent["payload"]["model"]),
            "actual_model": delegate_envelope.get("actual_model"), "model_source": delegate_envelope.get("model_source", "unreported"),
            "hermes_profile": intent["payload"]["hermes_profile"], "wrote_to": str(response_path),
            "ledger_entry": delegate_envelope.get("ledger_entry"), "live_spend": delegate_envelope.get("live_spend", True),
            "live_source_collection": False,
        }))
        return 0
    except Exception as exc:
        delegate_failure = isinstance(exc, DelegateFailure)
        if delegate_failure:
            delegate_envelope = exc.envelope
            if isinstance(delegate_envelope.get("live_spend"), bool):
                observed_live_spend = delegate_envelope["live_spend"]
        pre_manifest_rejection = isinstance(exc, RequiredOutputContractError)
        live_spend_unknown = (
            not pre_manifest_rejection and model_invocation_started
            and model_invocation_can_spend and observed_live_spend is None
        )
        rejected_response_written = False
        failure_class = classify_manifest_failure(exc) if manifest is not None else None
        failure_details = getattr(exc, "details", {}) if manifest is not None else {}
        if manifest is not None and intent is not None and response_path is not None:
            try:
                write_response_json(
                    response_path,
                    build_rejected_manifest_response(
                        manifest, failure_class or "manifest_rejected", intent, failure_details,
                    ),
                )
                rejected_response_written = True
            except Exception:
                rejected_response_written = False
        print(json.dumps({
            **({"schema": DELEGATE_FAILURE_SCHEMA} if delegate_failure else {}),
            "status": "degraded",
            "degraded_reason": (
                f"forge_worker_manifest_rejected:{failure_class}"
                if failure_class is not None
                else f"forge_worker_pre_manifest_rejected:{exc.code}"
                if pre_manifest_rejection
                else delegate_envelope.get("degraded_reason")
                if delegate_failure
                else "forge_worker_delegate_failed"
            ),
            "wrote_to": str(response_path) if rejected_response_written and response_path else None,
            "rejected_manifest_evidence": rejected_response_written,
            "provider": delegate_envelope.get("provider"),
            "requested_model": delegate_envelope.get("requested_model"),
            "actual_model": delegate_envelope.get("actual_model"),
            "model_source": delegate_envelope.get("model_source", "unreported"),
            "hermes_profile": delegate_envelope.get("hermes_profile"),
            "live_spend": False if pre_manifest_rejection else observed_live_spend,
            "live_spend_unknown": live_spend_unknown,
            "live_source_collection": False,
        }))
        return 1
if __name__ == "__main__":
    raise SystemExit(main())
