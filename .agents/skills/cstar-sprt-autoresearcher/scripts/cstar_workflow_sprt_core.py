"""Pure limits, discovery, TAP, hashing, SPRT, and receipt helpers."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Sequence


SCHEMA = "cstar.workflow_sprt_autoresearcher.v1"
REQUESTED_MODEL = "gpt-5.6-luna"
REQUESTED_REASONING = "max"
DEFAULT_ALPHA = 0.05
DEFAULT_BETA = 0.10
DEFAULT_P0 = 0.01
DEFAULT_P1 = 0.20
HARD_MAX_TRIALS = 12
HARD_PROCESS_TIMEOUT_SECONDS = 120.0
HARD_TOTAL_WALL_SECONDS = 900.0
DEFAULT_MAX_TRIALS = HARD_MAX_TRIALS
DEFAULT_TIMEOUT_SECONDS = HARD_PROCESS_TIMEOUT_SECONDS
DEFAULT_TOTAL_WALL_SECONDS = HARD_TOTAL_WALL_SECONDS
NODE_PROBE_TIMEOUT_SECONDS = 10.0
MAX_NODE_CANDIDATES = 16
NODE_SELECTION_POLICY = "canonical_cstar_runtime_policy_v1"
PROTECTED_STAGES = (
    "request",
    "authorization",
    "synthetic_execute",
    "delivered_unverified",
    "independent_validation_record_result",
    "closeout_terminal",
)
FOCUSED_LIFECYCLE_MODULES = (
    "tests/unit/cstar-kernel-mcp/test_forge_runtime_lifecycle_gate.test.ts",
    "tests/unit/cstar-kernel-mcp/test_worker_job_lifecycle_binding.test.ts",
    "tests/unit/cstar-kernel-mcp/test_terminal_forge_validation_linkage.test.ts",
    "tests/unit/cstar-kernel-mcp/test_host_workflow_validation.test.ts",
)
FIXED_LIFECYCLE_ARGUMENTS = (
    "scripts/run-tsx.mjs",
    "--test",
    "--test-reporter=tap",
    *FOCUSED_LIFECYCLE_MODULES,
)
SUITE_STAGE_COVERAGE = {
    "forge runtime lifecycle gate": ("request", "authorization", "synthetic_execute"),
    "subordinate worker-job lifecycle binding": (
        "delivered_unverified", "closeout_terminal",
    ),
    "public terminal forge validation linkage": (
        "independent_validation_record_result", "closeout_terminal",
    ),
    "host-workflow independent validation": ("independent_validation_record_result",),
}


class RunnerError(RuntimeError):
    """A fail-closed input or evidence error."""


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value))


def normalise_text(value: str | bytes | None) -> str:
    if value is None:
        return ""
    return value.decode("utf-8", errors="replace") if isinstance(value, bytes) else value


def _inside(root: Path, candidate: str | Path) -> tuple[Path, str]:
    root = root.resolve()
    raw = Path(candidate)
    resolved = (raw if raw.is_absolute() else root / raw).resolve()
    try:
        relative = resolved.relative_to(root)
    except ValueError as exc:
        raise RunnerError(f"path escapes checker root: {candidate}") from exc
    return resolved, relative.as_posix()


def source_snapshot(
    root: Path, source_paths: Sequence[str | Path],
) -> tuple[str, list[dict[str, Any]]]:
    if not source_paths:
        raise RunnerError("candidate source list is empty")
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source in source_paths:
        path, relative = _inside(root, source)
        if relative in seen:
            raise RunnerError(f"duplicate candidate source: {relative}")
        seen.add(relative)
        if not path.is_file():
            raise RunnerError(f"candidate source is not a file: {relative}")
        raw = path.read_bytes()
        entries.append({"path": relative, "bytes": len(raw), "sha256": sha256_bytes(raw)})
    entries.sort(key=lambda entry: str(entry["path"]))
    return sha256_json(entries), entries


def validate_limits(max_trials: int, timeout_seconds: float, total_wall_seconds: float) -> None:
    if not 0 <= max_trials <= HARD_MAX_TRIALS:
        raise RunnerError(f"max-trials must be between 0 and {HARD_MAX_TRIALS}")
    if not 0.0 < timeout_seconds <= HARD_PROCESS_TIMEOUT_SECONDS:
        raise RunnerError(
            f"timeout-seconds must be positive and at most {HARD_PROCESS_TIMEOUT_SECONDS:g}",
        )
    if not 0.0 < total_wall_seconds <= HARD_TOTAL_WALL_SECONDS:
        raise RunnerError(
            f"total-wall-seconds must be positive and at most {HARD_TOTAL_WALL_SECONDS:g}",
        )


def validate_probabilities(alpha: float, beta: float, p0: float, p1: float) -> None:
    if not 0.0 < alpha < 1.0 or not 0.0 < beta < 1.0:
        raise RunnerError("alpha and beta must be strictly between zero and one")
    if not 0.0 <= p0 < p1 <= 1.0:
        raise RunnerError("SPRT requires 0 <= p0 < p1 <= 1")


class _FallbackSPRT:
    def __init__(self, alpha: float, beta: float, p0: float, p1: float) -> None:
        self.A, self.B = (1.0 - beta) / alpha, beta / (1.0 - alpha)
        self.p0, self.p1, self.log_likelihood_ratio = p0, p1, 0.0

    def record_trial(self, success: bool) -> None:
        ratio = (1.0 - self.p1) / (1.0 - self.p0) if success else self.p1 / self.p0
        self.log_likelihood_ratio += math.log(ratio)

    @property
    def status(self) -> str:
        if self.log_likelihood_ratio >= math.log(self.A):
            return "REJECT"
        if self.log_likelihood_ratio <= math.log(self.B):
            return "ACCEPT"
        return "CONTINUE"


def new_sprt(root: Path) -> Any:
    for candidate in (root, Path(__file__).resolve().parents[4]):
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))
        try:
            from src.core.engine.utils.stability import GungnirValidator
            return GungnirValidator(
                alpha=DEFAULT_ALPHA, beta=DEFAULT_BETA, p0=DEFAULT_P0, p1=DEFAULT_P1,
            )
        except (ImportError, ModuleNotFoundError):
            continue
    return _FallbackSPRT(DEFAULT_ALPHA, DEFAULT_BETA, DEFAULT_P0, DEFAULT_P1)


def command_digest(argv: Sequence[str]) -> str:
    return sha256_json([str(value) for value in argv])


def executable_identity(root: Path, argv: Sequence[str]) -> str | None:
    path = Path(str(argv[0]))
    if not path.is_absolute():
        resolved = shutil.which(str(path))
        path = Path(resolved) if resolved else root / path
    return str(path.resolve()) if path.exists() else None


def _version_key(path: Path) -> tuple[int, int, int, str]:
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?", path.parents[1].name)
    version = tuple(int(value) for value in match.groups()) if match else (-1, -1, -1)
    return (*version, str(path))


def discover_node_candidates(
    *, path_value: str | None = None, home: Path | None = None,
) -> dict[str, Any]:
    ordered: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(raw: str | Path, source: str) -> None:
        path = Path(raw).resolve()
        rendered = str(path)
        if rendered not in seen and path.is_file() and os.access(path, os.X_OK):
            seen.add(rendered)
            ordered.append({"path": rendered, "source": source})

    current = shutil.which("node", path=path_value)
    if current:
        add(current, "current_path")
    nvm_root = (home or Path.home()) / ".nvm" / "versions" / "node"
    try:
        nvm_nodes = [entry / "bin" / "node" for entry in nvm_root.iterdir()]
    except OSError:
        nvm_nodes = []
    for candidate in sorted(nvm_nodes, key=_version_key, reverse=True):
        add(candidate, "standard_nvm")
    discovered_count = len(ordered)
    return {
        "policy": NODE_SELECTION_POLICY,
        "candidate_limit": MAX_NODE_CANDIDATES,
        "discovered_count": discovered_count,
        "truncated": discovered_count > MAX_NODE_CANDIDATES,
        "candidates": ordered[:MAX_NODE_CANDIDATES],
    }


def validate_fixed_lifecycle_files(root: Path) -> None:
    for relative in (FIXED_LIFECYCLE_ARGUMENTS[0], *FOCUSED_LIFECYCLE_MODULES):
        path, _ = _inside(root, relative)
        if not path.is_file():
            raise RunnerError(f"fixed lifecycle source is missing: {relative}")


def fixed_lifecycle_argv(node_path: str) -> list[str]:
    return [str(Path(node_path).resolve()), *FIXED_LIFECYCLE_ARGUMENTS]


def _normalise_stage(value: str) -> str | None:
    token = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    aliases = {
        "request": "request", "authorize": "authorization", "authorization": "authorization",
        "execute": "synthetic_execute", "synthetic_execution": "synthetic_execute",
        "synthetic_execute": "synthetic_execute", "delivery": "delivered_unverified",
        "delivered": "delivered_unverified", "delivered_unverified": "delivered_unverified",
        "independent_validation": "independent_validation_record_result",
        "record_result": "independent_validation_record_result",
        "independent_validation_record_result": "independent_validation_record_result",
        "closeout": "closeout_terminal", "terminal": "closeout_terminal",
        "closeout_terminal": "closeout_terminal",
    }
    return aliases.get(token)


def _tap_error(reason: str, coverage: set[str]) -> dict[str, Any]:
    return {"valid": False, "reason": reason, "coverage": sorted(coverage)}


def parse_tap(output: str) -> dict[str, Any]:
    lines = output.splitlines()
    coverage: set[str] = set()
    for line in lines:
        stage_match = re.match(r"^\s*#\s*cstar-stage:\s*(.+?)\s*$", line, re.IGNORECASE)
        if stage_match:
            coverage.update(
                stage for token in re.split(r"[\s,]+", stage_match.group(1))
                if (stage := _normalise_stage(token))
            )
        suite_match = re.match(r"^# Subtest:\s*(.+?)\s*$", line, re.IGNORECASE)
        if suite_match:
            coverage.update(SUITE_STAGE_COVERAGE.get(suite_match.group(1).lower(), ()))
    versions = [index for index, line in enumerate(lines) if re.fullmatch(r"TAP version \d+", line)]
    if not versions:
        return _tap_error("malformed_tap_missing_version", coverage)
    if len(versions) != 1:
        return _tap_error("malformed_tap_duplicate_version", coverage)

    outcome_re = re.compile(r"^(not ok|ok)\s+(\d+)(?:\s+.*)?$", re.IGNORECASE)
    plan_re = re.compile(r"^(\d+)\.\.(\d+)(?:\s+#.*)?$", re.IGNORECASE)
    outcomes = [(index, match) for index, line in enumerate(lines)
                if (match := outcome_re.fullmatch(line))]
    plans = [(index, match) for index, line in enumerate(lines)
             if (match := plan_re.fullmatch(line))]
    malformed_plan = any(
        re.match(r"^\d+\s*\.\.", line.lstrip()) and not plan_re.fullmatch(line.lstrip())
        for line in lines
    )
    if malformed_plan:
        return _tap_error("malformed_tap_plan", coverage)
    if not plans:
        return _tap_error("malformed_tap_missing_plan", coverage)
    if len(plans) != 1:
        return _tap_error("malformed_tap_duplicate_plan", coverage)
    plan_index, plan = plans[0]
    directive_re = re.compile(r"#\s*(?:skip|todo)\b", re.IGNORECASE)
    if directive_re.search(plan.group(0)) or any(
        directive_re.search(line) and re.match(r"^\s*(?:not )?ok\b", line, re.IGNORECASE)
        for line in lines
    ):
        return _tap_error("protected_stage_skipped", coverage)
    if any(index > plan_index for index, _ in outcomes):
        return _tap_error("malformed_tap_nonterminal_plan", coverage)
    if any(line and not line.startswith("#") for line in lines[plan_index + 1:]):
        return _tap_error("malformed_tap_nonterminal_plan", coverage)
    ordinals = [int(match.group(2)) for _, match in outcomes]
    if ordinals != list(range(1, len(outcomes) + 1)):
        return _tap_error("malformed_tap_outcome_sequence", coverage)
    plan_start, plan_total = int(plan.group(1)), int(plan.group(2))
    if plan_start != 1 or plan_total != len(outcomes):
        return _tap_error("malformed_tap_plan_outcome_mismatch", coverage)

    labels = ("tests", "pass", "fail", "skipped", "todo", "cancelled")
    summary: dict[str, int] = {}
    for label in labels:
        matches = re.findall(rf"^# {label} (\d+)$", output, re.MULTILINE)
        if not matches:
            return _tap_error(f"malformed_tap_missing_{label}", coverage)
        if len(matches) != 1:
            return _tap_error(f"malformed_tap_duplicate_{label}", coverage)
        summary[label] = int(matches[0])
    total = summary["tests"]
    reason = None
    if total <= 0:
        reason = "zero_test_denominator"
    elif sum(summary[label] for label in labels[1:]) != total:
        reason = "malformed_tap_summary_mismatch"
    elif any(match.group(1).lower() == "not ok" for _, match in outcomes):
        reason = "test_failure"
    elif summary["fail"]:
        reason = "test_failure"
    elif summary["skipped"] or summary["todo"] or summary["cancelled"]:
        reason = "protected_stage_skipped"
    elif summary["pass"] != total:
        reason = "malformed_tap_pass_mismatch"
    return {
        "valid": reason is None,
        "reason": reason,
        "coverage": sorted(coverage),
        "passed": summary["pass"],
        "failed": summary["fail"],
        "skipped": summary["skipped"],
        "todo": summary["todo"],
        "cancelled": summary["cancelled"],
        "total": total,
        "plan_total": plan_total,
        "top_level_outcomes": len(outcomes),
    }


def output_digest(process_result: dict[str, Any]) -> str:
    combined = normalise_text(process_result.get("stdout")) + "\x00" + normalise_text(
        process_result.get("stderr"),
    )
    return sha256_bytes(combined.encode("utf-8"))


def evaluate_process(
    process_result: dict[str, Any], required_stages: Sequence[str],
) -> dict[str, Any]:
    tap = parse_tap(normalise_text(process_result.get("stdout")))
    coverage = set(tap.get("coverage", []))
    missing = [stage for stage in required_stages if stage not in coverage]
    reason = None
    if process_result.get("timed_out"):
        reason = "timeout"
    elif process_result.get("spawn_error"):
        reason = "spawn_error"
    elif process_result.get("exit_code") != 0:
        reason = "test_failure"
    elif not tap.get("valid"):
        reason = str(tap.get("reason") or "malformed_tap")
    elif missing:
        reason = "missing_protected_stage"
    return {
        "success": reason is None,
        "failure_reason": reason,
        "tap": tap,
        "coverage": [stage for stage in required_stages if stage in coverage],
        "missing_stages": missing,
        "output_sha256": output_digest(process_result),
        "stderr_sha256": sha256_bytes(normalise_text(process_result.get("stderr")).encode()),
    }


def fingerprints(
    evaluation: dict[str, Any], process_result: dict[str, Any], label: str, trial_index: int,
) -> list[dict[str, Any]]:
    if evaluation.get("success"):
        return []
    reasons = [(stage, "missing_protected_stage") for stage in evaluation.get("missing_stages", [])]
    reasons = reasons or [(label, evaluation.get("failure_reason") or "failed_stage")]
    result = []
    for stage, reason in reasons[:8]:
        material = {
            "label": label, "stage": stage, "trial": trial_index, "reason": reason,
            "argv": process_result.get("argv", []), "output_sha256": evaluation.get("output_sha256"),
        }
        result.append({
            "stage": stage, "trial": trial_index, "reason": reason,
            "fingerprint": sha256_json(material)[:24],
            "output_sha256": evaluation.get("output_sha256"),
        })
    return result


def stage_record(process_result: dict[str, Any], evaluation: dict[str, Any]) -> dict[str, Any]:
    tap = evaluation.get("tap", {})
    stable = {
        "argv": list(process_result["argv"]), "exit_code": process_result.get("exit_code"),
        "timed_out": bool(process_result.get("timed_out")),
        "success": bool(evaluation["success"]), "failure_reason": evaluation.get("failure_reason"),
        "passed_tests": tap.get("passed", 0), "failed_tests": tap.get("failed", 0),
        "skipped_tests": tap.get("skipped", 0), "todo_tests": tap.get("todo", 0),
        "cancelled_tests": tap.get("cancelled", 0), "total_tests": tap.get("total", 0),
        "coverage": list(evaluation.get("coverage", [])),
        "missing_stages": list(evaluation.get("missing_stages", [])),
        "output_sha256": evaluation.get("output_sha256"),
        "stderr_sha256": evaluation.get("stderr_sha256"),
    }
    return {
        **stable, "duration_ms": process_result.get("duration_ms", 0.0),
        "evidence_hash": sha256_json(stable),
    }


def trial_hash(record: dict[str, Any]) -> str:
    fields = (
        "trial", "argv", "exit_code", "timed_out", "success", "failure_reason",
        "passed_tests", "failed_tests", "skipped_tests", "todo_tests", "cancelled_tests",
        "total_tests", "coverage", "missing_stages", "output_sha256", "stderr_sha256",
    )
    return sha256_json({field: record[field] for field in fields})


def external_effects(output_dir: str | Path | None) -> dict[str, bool]:
    return {
        "live_mcp": False, "live_provider": False, "live_source": False,
        "network": False, "direct_hall_sqlite_writes": False, "git_mutation": False,
        "install_activation_restart": False, "deployment": False,
        "secrets_or_config": False, "production": False,
        "receipt_write": output_dir is not None,
    }


def runner_error_result(exc: RunnerError) -> dict[str, Any]:
    fingerprint = sha256_json(["runner_error", str(exc)])[:24]
    failed = [{
        "stage": "runner_preflight", "trial": 0, "reason": "runner_error",
        "fingerprint": fingerprint, "output_sha256": None,
    }]
    return {
        "schema": SCHEMA, "runner_mode": "host_only_deterministic",
        "workflow_score": 0.0, "sprt_verdict": "INCONCLUSIVE",
        "cstar_acceptance": "UNVERIFIED", "stop_reason": "runner_error", "error": str(exc),
        "passed": 0, "failed": 0, "total": 0,
        "requested_model": REQUESTED_MODEL, "actual_model": None,
        "requested_reasoning": REQUESTED_REASONING, "actual_reasoning": None,
        "external_effects": external_effects(None),
        "failed_stage_fingerprints": failed,
        "autoresearcher": {
            "mode": "proposal_only", "next_action": "dispatch_repair_bead",
            "failed_stage_fingerprints": failed,
        },
    }


def write_receipt(root: Path, output_dir: str | Path, result: dict[str, Any]) -> dict[str, str]:
    destination, _ = _inside(root, output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    receipt_path, checksum_path = destination / "receipt.json", destination / "receipt.sha256"
    raw = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False).encode() + b"\n"
    receipt_path.write_bytes(raw)
    digest = sha256_bytes(raw)
    checksum_path.write_text(f"{digest}  {receipt_path.name}\n", encoding="utf-8")
    return {"path": str(receipt_path), "sha256_path": str(checksum_path), "sha256": digest}
