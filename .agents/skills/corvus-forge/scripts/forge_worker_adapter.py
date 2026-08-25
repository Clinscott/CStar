#!/usr/bin/env python3
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
    apply_files, authorized_scopes, build_worker_manifest_contract, ensure_safe_write_target, ManifestPathContractError,
    minimal_subprocess_environment, RequiredOutputContractError, resolve_path, resolve_write_path,
    sealed_required_outputs, verify_package_locks, verify_runtime_file, write_response_json,
)
from forge_worker_evidence import (
    DELEGATE_FAILURE_SCHEMA, bounded_delegate_failure, bounded_process_failure, bounded_success_evidence,
    role_evidence as project_role_evidence,
)
SUCCESS_STATUSES = {"accepted", "ok", "pass", "passed", "success", "succeeded"}
EXPECTED_MANIFEST_FIELDS = set("status summary files artifacts validation metrics boundaries callback_packet".split())
def role_evidence(raw: dict[str, Any]) -> dict[str, Any]: return project_role_evidence(raw)[0]
class ManifestContractError(ValueError):
    def __init__(self, code: str, details: dict[str, Any] | None = None):
        super().__init__(code)
        self.code = code
        self.details = details or {}
class DelegateFailure(RuntimeError):
    def __init__(self, envelope: dict[str, Any]):
        super().__init__(str(envelope["degraded_reason"])); self.envelope = envelope
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
        "artifacts": {"rejected_manifest": {
                "schema": "cstar.forge_rejected_manifest_evidence.v1",
                "sha256": hashlib.sha256(canonical).hexdigest(), "bytes": len(canonical),
                "failure_class": failure_class, **details,
                "top_level_field_count": len(manifest),
                "unknown_field_count": len(set(manifest) - EXPECTED_MANIFEST_FIELDS),
                "status": {"present": "status" in manifest, "type": json_type_name(status),
                           "recognized_success": known_status},
                "files": {"present": "files" in manifest, "type": json_type_name(files),
                          "count": len(files) if isinstance(files, list) else None},
                "callback_packet": {"present": "callback_packet" in manifest,
                                    "type": json_type_name(callback), "matches_expected": callback_matches},
                "raw_manifest_persisted": False, "raw_values_emitted": False,
            }},
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
    if len(by_role) != len(dependencies):
        raise ValueError("sealed worker dependency roles must be unique")
    expected = {
        "forge_worker_safety": "forge_worker_safety.py",
        "hermes_minimax_delegate": "hermes_minimax_delegate.mjs",
        "hermes_runtime_lineage": "hermes_runtime_lineage.mjs",
        "forge_role_plan": "forge_role_plan.mjs",
        "forge_worker_evidence": "forge_worker_evidence.py",
        "forge_delegate_evidence": "forge_delegate_evidence.mjs",
        "forge_delegate_preflight": "forge_delegate_preflight.mjs",
    }
    if set(by_role) != set(expected):
        raise ValueError("sealed worker dependency set is incomplete")
    adapter_directory = Path(__file__).resolve().parent
    for role, filename in expected.items():
        proof = by_role[role]
        proof["owner_uid"] = os.getuid()
        verify_runtime_file(adapter_directory / filename, proof, role)
    delegate_path = adapter_directory / expected["hermes_minimax_delegate"]
    python_proof = runtime.get("python_interpreter")
    node_proof = runtime.get("node_interpreter")
    if not isinstance(python_proof, dict) or not isinstance(node_proof, dict):
        raise ValueError("sealed interpreter proofs are required")
    python_path = Path(str(python_proof.get("path") or ""))
    node_path = Path(str(node_proof.get("path") or ""))
    # CStar verifies owner on the host; the user namespace remaps host uid 0.
    verify_runtime_file(python_path, python_proof, "python_interpreter", verify_owner=False)
    verify_runtime_file(node_path, node_proof, "node_interpreter", verify_owner=False)
    if Path(sys.executable).resolve() != python_path.resolve():
        raise ValueError("running Python interpreter does not match sealed runtime")
    return node_path, delegate_path
def verify_execution_identity(intent: dict[str, Any]) -> dict[str, str]:
    identity = intent.get("execution_identity")
    if not isinstance(identity, dict):
        raise ValueError("sealed Forge execution identity is required")
    fields = {"forge_request_receipt_id": "CSTAR_FORGE_REQUEST_RECEIPT_ID",
        "forge_execute_receipt_id": "CSTAR_FORGE_EXECUTE_RECEIPT_ID",
        "decision_id": "CSTAR_FORGE_EXECUTE_DECISION_ID",
        "adapter_ref": "CSTAR_FORGE_EXECUTE_ADAPTER_REF"}
    if set(identity) != set(fields):
        raise ValueError("sealed Forge execution identity fields are invalid")
    verified: dict[str, str] = {}
    for field, env_name in fields.items():
        value = identity.get(field)
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9._:/-]{1,200}", value):
            raise ValueError("sealed Forge execution identity value is invalid")
        if os.environ.get(env_name) != value:
            raise ValueError("sealed Forge execution identity does not match runtime")
        verified[field] = value
    return verified
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
    execution_identity: dict[str, str], before_delegate: Callable[[], None],
) -> tuple[dict[str, Any], dict[str, Any]]:
    override = os.environ.get("CSTAR_FORGE_WORKER_MODEL_RESPONSE")
    if override:
        if not os.environ.get("NODE_TEST_CONTEXT") or os.environ.get("CSTAR_FORGE_TEST_MODE") != "1":
            raise ValueError("CSTAR_FORGE_WORKER_MODEL_RESPONSE is test-only")
        return extract_model_json(Path(override).read_text(encoding="utf-8")), {
            "status": "ok", "intent_id": "test-override", "duration_ms": 0,
            "response_chars": Path(override).stat().st_size,
            "est_prompt_tokens": 0,
            "est_response_tokens": 0,
            "model": intent["payload"]["model"], "provider": "minimax-oauth", "auth_provider": "minimax-oauth", "auth_mode": "oauth",
            "requested_model": intent["payload"]["model"],
            "actual_model": None, "model_source": "unreported",
            "hermes_profile": intent["payload"]["hermes_profile"],
            "ledger_entry": None, "live_spend": False, "live_source_collection": False,
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
            "Forge worker execution guard:", "Do not write files directly.",
            "Do not run shell commands.",
            "Do not create directories or mutate the workspace yourself.",
            "Your only output is the strict JSON worker manifest described below.",
            "The adapter will validate the manifest and perform all bounded writes.",
        ])
        delegate_intent = {
            "intent": base_intent + "\n\n" + worker_guard + "\n\n" + worker_manifest_contract,
            "execution_identity": execution_identity,
            "project_root": str(project_root),
            "target_paths": intent.get("target_paths", []),
            "hermes_preflight": intent.get("hermes_preflight"),
            "payload": {
                "hermes_profile": intent["payload"]["hermes_profile"],
                "model": intent["payload"]["model"],
                "expected_output": "json",
                "write_to": str(model_response),
                "append_with_separator": None,
                "tags": list(intent["payload"].get("tags", [])) + ["corvus-forge-worker"],
                "timeout_seconds": intent["payload"].get("timeout_seconds", 600),
            },
        }
        delegate_intent_path = tmp_path / "delegate-intent.json"
        write_json(delegate_intent_path, delegate_intent)
        env = minimal_subprocess_environment({
            "CSTAR_FORGE_HERMES_DELEGATED": "",
            "CSTAR_FORGE_REQUEST_RECEIPT_ID": execution_identity["forge_request_receipt_id"],
            "CSTAR_FORGE_EXECUTE_RECEIPT_ID": execution_identity["forge_execute_receipt_id"],
            "CSTAR_FORGE_EXECUTE_DECISION_ID": execution_identity["decision_id"],
            "CSTAR_FORGE_EXECUTE_ADAPTER_REF": execution_identity["adapter_ref"],
        })
        before_delegate()
        try:
            proc = subprocess.run(
                [str(node_interpreter), str(delegate_script), "--intent-file", str(delegate_intent_path)],
                cwd=str(project_root), env=env, text=True, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=int(delegate_intent["payload"]["timeout_seconds"]) + 30,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise DelegateFailure(bounded_process_failure(exc)) from exc
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
        try:
            envelope.update(bounded_success_evidence(envelope))
        except ValueError:
            envelope["degraded_reason"] = "forge_worker_delegate_evidence_invalid"
            raise DelegateFailure(bounded_delegate_failure(
                envelope, "forge_worker_delegate_evidence_invalid",
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
        "artifacts": {"changed_files": changed,
                      "model_artifact_claims_sha256": reported_artifacts_sha256},
        "validation": manifest.get("validation") if isinstance(manifest.get("validation"), (dict, list)) else {},
        "metrics": manifest.get("metrics") if isinstance(manifest.get("metrics"), (dict, list)) else {},
        "boundaries": {
            **(manifest.get("boundaries") if isinstance(manifest.get("boundaries"), dict) else {}),
            "project_root": str(project_root), "codex_worker_fallback_allowed": False,
            "live_source_collection": False, "direct_hall_sqlite_bypass": False,
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
    observed_live_spend_unknown = False
    known_spend_observed = False
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
        execution_identity = verify_execution_identity(intent)
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
            worker_manifest_contract, execution_identity, mark_model_invocation_started,
        )
        observed_live_spend = delegate_envelope.get("live_spend")
        observed_live_spend_unknown = delegate_envelope.get("live_spend_unknown") is True
        known_spend_observed = delegate_envelope.get("known_spend_observed") is True
        files = normalize_file_entries(manifest)
        expected_callback = str(intent.get("expected_callback_packet") or "").strip()
        validate_callback_packet(manifest, expected_callback)
        def persist_validated_response(changed_files: list[dict[str, Any]]) -> None:
            response = build_response(manifest, changed_files, delegate_envelope, intent, project_root)
            write_response_json(response_path, response)
        changed = apply_files(project_root, scopes, files, required_output_paths,
                              persist_validated_response)
        print(json.dumps({
            **role_evidence(delegate_envelope),
            "status": "ok", "intent_id": os.environ.get("CSTAR_FORGE_EXECUTE_RECEIPT_ID"),
            "duration_ms": delegate_envelope.get("duration_ms"), "response_chars": response_path.stat().st_size,
            "est_prompt_tokens": delegate_envelope.get("est_prompt_tokens"),
            "est_response_tokens": delegate_envelope.get("est_response_tokens"), "model": intent["payload"]["model"],
            "provider": delegate_envelope.get("provider", "minimax-oauth"), "auth_provider": delegate_envelope.get("auth_provider", "minimax-oauth"), "auth_mode": delegate_envelope.get("auth_mode", "oauth"),
            "requested_model": delegate_envelope.get("requested_model", intent["payload"]["model"]),
            "actual_model": delegate_envelope.get("actual_model"), "model_source": delegate_envelope.get("model_source", "unreported"),
            "hermes_profile": intent["payload"]["hermes_profile"], "wrote_to": str(response_path),
            "ledger_entry": delegate_envelope.get("ledger_entry"),
            "live_spend": observed_live_spend,
            "live_spend_unknown": observed_live_spend_unknown,
            "known_spend_observed": known_spend_observed,
            "live_source_collection": False,
        }))
        return 0
    except Exception as exc:
        delegate_failure = isinstance(exc, DelegateFailure)
        if delegate_failure:
            delegate_envelope = exc.envelope
            observed_live_spend = delegate_envelope.get("live_spend")
            observed_live_spend_unknown = delegate_envelope.get("live_spend_unknown") is True
            known_spend_observed = delegate_envelope.get("known_spend_observed") is True
        pre_manifest_rejection = isinstance(exc, RequiredOutputContractError)
        live_spend_unknown = observed_live_spend_unknown or (
            not pre_manifest_rejection and model_invocation_started
            and model_invocation_can_spend and observed_live_spend is None)
        if live_spend_unknown:
            observed_live_spend = None
        rejected_response_written = False
        failure_class = classify_manifest_failure(exc) if manifest is not None else None
        failure_details = getattr(exc, "details", {}) if manifest is not None else {}
        if manifest is not None and intent is not None and response_path is not None:
            try:
                write_response_json(response_path, build_rejected_manifest_response(
                    manifest, failure_class or "manifest_rejected", intent, failure_details))
                rejected_response_written = True
            except Exception:
                rejected_response_written = False
        print(json.dumps({
            **role_evidence(delegate_envelope),
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
            "provider": delegate_envelope.get("provider"), "auth_provider": delegate_envelope.get("auth_provider"), "auth_mode": delegate_envelope.get("auth_mode"),
            "requested_model": delegate_envelope.get("requested_model"),
            "actual_model": delegate_envelope.get("actual_model"),
            "model_source": delegate_envelope.get("model_source", "unreported"),
            "hermes_profile": delegate_envelope.get("hermes_profile"),
            "live_spend": False if pre_manifest_rejection else observed_live_spend,
            "live_spend_unknown": live_spend_unknown,
            "known_spend_observed": False if pre_manifest_rejection else known_spend_observed,
            "live_source_collection": False,
        }))
        return 1
if __name__ == "__main__":
    raise SystemExit(main())
