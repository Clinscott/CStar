#!/usr/bin/env python3
"""Run the fixed synthetic CStar lifecycle with bounded host-native SPRT."""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Mapping, Sequence
from cstar_workflow_sprt_core import (
    DEFAULT_ALPHA,
    DEFAULT_BETA,
    DEFAULT_MAX_TRIALS,
    DEFAULT_P0,
    DEFAULT_P1,
    DEFAULT_TIMEOUT_SECONDS,
    DEFAULT_TOTAL_WALL_SECONDS,
    FIXED_LIFECYCLE_ARGUMENTS,
    HARD_MAX_TRIALS,
    HARD_PROCESS_TIMEOUT_SECONDS,
    HARD_TOTAL_WALL_SECONDS,
    NODE_PROBE_TIMEOUT_SECONDS,
    PROTECTED_STAGES,
    REQUESTED_MODEL,
    REQUESTED_REASONING,
    SCHEMA,
    RunnerError,
    command_digest,
    discover_node_candidates,
    evaluate_process,
    executable_identity,
    external_effects,
    fingerprints,
    fixed_lifecycle_argv,
    new_sprt,
    normalise_text,
    runner_error_result,
    sha256_bytes,
    sha256_json,
    source_snapshot,
    stage_record,
    trial_hash,
    validate_fixed_lifecycle_files,
    validate_limits,
    validate_probabilities,
    write_receipt,
)
from cstar_workflow_gungnir import score_candidate_sources
NODE_SMOKE_SOURCE = """\
const fs = require('node:fs'), path = require('node:path');
const policy = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'runtime-policy.json'), 'utf8'));
const dependency = path.join(process.cwd(), 'node_modules', policy.native.dependency);
const evidence = {
  node_version: process.version,
  modules_abi: process.versions.modules, napi_version: process.versions.napi,
  exec_path: process.execPath,
  compatible: false
};
try {
  evidence.better_sqlite3_version = require(path.join(dependency, 'package.json')).version;
  const Database = require(dependency);
  const db = new Database(':memory:');
  const row = db.prepare('SELECT 1 AS value').get();
  db.close();
  evidence.compatible = row.value === 1 && evidence.node_version === `v${policy.node.version}` && evidence.modules_abi === policy.node.node_module_version && evidence.napi_version === policy.node.napi_version && evidence.better_sqlite3_version === policy.native.version;
  evidence.smoke = 'in_memory_select_1_no_write';
} catch (error) {
  evidence.error_code = error && (error.code || error.name) || 'native_dependency_error';
}
process.stdout.write(JSON.stringify(evidence));
process.exitCode = evidence.compatible ? 0 : 1;
"""
def _run_process(
    root: Path,
    argv: Sequence[str],
    timeout_seconds: float,
    extra_env: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    started = time.monotonic()
    child_env = os.environ.copy()
    child_env.update({
        "CSTAR_SPRT_AUTORESEARCHER_HOST_ONLY": "1",
        "CSTAR_SPRT_AUTORESEARCHER_EXTERNAL_EFFECTS": "none",
        "PYTHONDONTWRITEBYTECODE": "1",
        "TMPDIR": "/tmp",
        "TEMP": "/tmp",
        "TMP": "/tmp",
        "NODE_OPTIONS": "",
        "NODE_PATH": "",
        **dict(extra_env or {}),
    })
    try:
        completed = subprocess.run(
            list(argv), cwd=str(root), env=child_env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
            errors="replace", timeout=timeout_seconds, shell=False, check=False,
        )
        return {
            "argv": list(argv), "exit_code": completed.returncode, "timed_out": False,
            "spawn_error": None, "stdout": completed.stdout, "stderr": completed.stderr,
            "duration_ms": round((time.monotonic() - started) * 1000.0, 12),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "argv": list(argv), "exit_code": None, "timed_out": True,
            "spawn_error": None, "stdout": normalise_text(exc.stdout),
            "stderr": normalise_text(exc.stderr),
            "duration_ms": round((time.monotonic() - started) * 1000.0, 12),
        }
    except OSError as exc:
        return {
            "argv": list(argv), "exit_code": None, "timed_out": False,
            "spawn_error": f"{type(exc).__name__}: {exc}", "stdout": "", "stderr": "",
            "duration_ms": round((time.monotonic() - started) * 1000.0, 12),
        }
def _run_bounded(
    root: Path,
    argv: Sequence[str],
    process_cap: float,
    deadline_at: float,
    extra_env: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    remaining = deadline_at - time.monotonic()
    if remaining <= 0:
        return {
            "argv": list(argv), "exit_code": None, "timed_out": True,
            "spawn_error": None, "stdout": "", "stderr": "", "duration_ms": 0.0,
            "deadline_limited": True, "deadline_exhausted": True,
        }
    result = _run_process(root, argv, min(process_cap, remaining), extra_env)
    result["deadline_limited"] = remaining < process_cap
    result["deadline_exhausted"] = bool(
        result["timed_out"] and result["deadline_limited"],
    )
    return result
def select_compatible_node(root: Path, deadline_at: float) -> dict[str, Any]:
    discovery = discover_node_candidates()
    evidence: dict[str, Any] = {
        **discovery,
        "native_dependency": "better-sqlite3",
        "compatibility_smoke": "in_memory_select_1_no_write",
        "smoke_is_no_write": True,
        "smoke_source_sha256": sha256_bytes(NODE_SMOKE_SOURCE.encode()),
        "probes": [],
        "selected": None,
    }
    for candidate in discovery["candidates"]:
        argv = [candidate["path"], "-e", NODE_SMOKE_SOURCE]
        process = _run_bounded(root, argv, NODE_PROBE_TIMEOUT_SECONDS, deadline_at)
        try:
            reported = json.loads(normalise_text(process.get("stdout")))
        except (json.JSONDecodeError, TypeError):
            reported = {}
        exec_matches = False
        if isinstance(reported, dict) and reported.get("exec_path"):
            exec_matches = Path(str(reported["exec_path"])).resolve() == Path(candidate["path"])
        compatible = bool(
            process.get("exit_code") == 0
            and not process.get("timed_out")
            and isinstance(reported, dict)
            and reported.get("compatible") is True
            and reported.get("smoke") == "in_memory_select_1_no_write"
            and exec_matches
        )
        probe = {
            **candidate,
            "argv": argv,
            "argv_sha256": command_digest(argv),
            "exit_code": process.get("exit_code"),
            "timed_out": bool(process.get("timed_out")),
            "deadline_exhausted": bool(process.get("deadline_exhausted")),
            "compatible": compatible,
            "node_version": reported.get("node_version") if isinstance(reported, dict) else None,
            "modules_abi": reported.get("modules_abi") if isinstance(reported, dict) else None,
            "napi_version": reported.get("napi_version") if isinstance(reported, dict) else None,
            "better_sqlite3_version": (
                reported.get("better_sqlite3_version") if isinstance(reported, dict) else None
            ),
            "error_code": reported.get("error_code") if isinstance(reported, dict) else None,
            "stdout_sha256": sha256_bytes(normalise_text(process.get("stdout")).encode()),
            "stderr_sha256": sha256_bytes(normalise_text(process.get("stderr")).encode()),
            "duration_ms": process.get("duration_ms", 0.0),
            "selected": compatible,
        }
        evidence["probes"].append(probe)
        if compatible:
            evidence["selected"] = {
                key: probe[key] for key in (
                    "path", "source", "node_version", "modules_abi", "napi_version",
                    "better_sqlite3_version", "argv_sha256",
                )
            }
            break
        if process.get("deadline_exhausted"):
            evidence["selection_failure_reason"] = "total_deadline_exhausted"
            break
    if evidence["selected"] is None and "selection_failure_reason" not in evidence:
        evidence["selection_failure_reason"] = "no_compatible_node"
    evidence["selection_evidence_sha256"] = sha256_json(evidence)
    return evidence
def run_workflow(
    *,
    checker_root: str | Path,
    candidate_sources: Sequence[str | Path],
    output_dir: str | Path | None = None,
    max_trials: int = DEFAULT_MAX_TRIALS,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    total_wall_seconds: float = DEFAULT_TOTAL_WALL_SECONDS,
) -> dict[str, Any]:
    started = time.monotonic()
    validate_limits(max_trials, timeout_seconds, total_wall_seconds)
    validate_probabilities(DEFAULT_ALPHA, DEFAULT_BETA, DEFAULT_P0, DEFAULT_P1)
    deadline_at = started + total_wall_seconds
    root = Path(checker_root).resolve()
    if not root.is_dir():
        raise RunnerError(f"checker root is not a directory: {root}")
    validate_fixed_lifecycle_files(root)
    source_digest, source_entries = source_snapshot(root, candidate_sources)
    lifecycle_digest, lifecycle_entries = source_snapshot(
        root, (FIXED_LIFECYCLE_ARGUMENTS[0], *FIXED_LIFECYCLE_ARGUMENTS[3:]),
    )
    node_runtime = select_compatible_node(root, deadline_at)
    gungnir = score_candidate_sources(
        root, candidate_sources, node_runtime=node_runtime, deadline_at=deadline_at,
        process_cap=timeout_seconds,
    )
    selected = node_runtime.get("selected")
    stage_argv = fixed_lifecycle_argv(selected["path"]) if selected else []
    trial_argv = list(stage_argv)
    stage_command_sha = command_digest(stage_argv)
    trial_command_sha = command_digest(trial_argv)
    trial_executable = executable_identity(root, trial_argv) if trial_argv else None

    if selected:
        stage_process = _run_bounded(
            root, stage_argv, timeout_seconds, deadline_at,
            {"CSTAR_SPRT_PHASE": "stage_pass", "CSTAR_SPRT_TRIAL_INDEX": "0"},
        )
        stage_evaluation = evaluate_process(stage_process, PROTECTED_STAGES)
    else:
        reason = str(node_runtime.get("selection_failure_reason") or "no_compatible_node")
        stage_process = {
            "argv": [], "exit_code": None, "timed_out": reason == "total_deadline_exhausted",
            "spawn_error": reason, "stdout": "", "stderr": "", "duration_ms": 0.0,
        }
        stage_evaluation = evaluate_process(stage_process, PROTECTED_STAGES)
        stage_evaluation["failure_reason"] = reason
    stage_result = stage_record(stage_process, stage_evaluation)
    failed_fingerprints = fingerprints(stage_evaluation, stage_process, "stage_pass", 0)
    try:
        after_stage_digest, _ = source_snapshot(root, candidate_sources)
        after_lifecycle_digest, _ = source_snapshot(
            root, (FIXED_LIFECYCLE_ARGUMENTS[0], *FIXED_LIFECYCLE_ARGUMENTS[3:]),
        )
    except RunnerError:
        after_stage_digest = after_lifecycle_digest = "source-unavailable"
    source_stable = (
        after_stage_digest == source_digest and after_lifecycle_digest == lifecycle_digest
    )
    if not source_stable:
        failed_fingerprints.append({
            "stage": "candidate_source", "trial": 0, "reason": "source_drift",
            "fingerprint": sha256_json([
                source_digest, after_stage_digest, lifecycle_digest, after_lifecycle_digest,
            ])[:24],
            "output_sha256": None,
        })
    stage_passed = bool(stage_evaluation["success"]) and source_stable

    validator = new_sprt(root)
    trials: list[dict[str, Any]] = []
    trial_hashes: list[str] = []
    coverage_by_trial: list[dict[str, Any]] = []
    passed = failed = 0
    hard_failure = False
    if not stage_passed:
        hard_failure = True
        stage_reason = str(stage_evaluation.get("failure_reason") or "stage_pass")
        stop_reason = (
            "fail_closed_total_deadline" if stage_reason == "total_deadline_exhausted"
            else "fail_closed_no_compatible_node" if stage_reason == "no_compatible_node"
            else "fail_closed_stage_pass"
        )
    elif max_trials == 0:
        stop_reason = "zero_denominator"
    else:
        stop_reason = "max_trials_inconclusive"
        for trial_index in range(1, max_trials + 1):
            if time.monotonic() >= deadline_at:
                hard_failure, stop_reason = True, "fail_closed_total_deadline"
                failed_fingerprints.append({
                    "stage": "full_lifecycle", "trial": trial_index,
                    "reason": "total_deadline_exhausted",
                    "fingerprint": sha256_json([trial_index, trial_command_sha])[:24],
                    "output_sha256": None,
                })
                break
            try:
                current_source, _ = source_snapshot(root, candidate_sources)
                current_lifecycle, _ = source_snapshot(
                    root, (FIXED_LIFECYCLE_ARGUMENTS[0], *FIXED_LIFECYCLE_ARGUMENTS[3:]),
                )
                validate_fixed_lifecycle_files(root)
            except RunnerError:
                current_source = current_lifecycle = "source-unavailable"
            command_stable = (
                command_digest(trial_argv) == trial_command_sha
                and executable_identity(root, trial_argv) == trial_executable
            )
            if not command_stable or current_lifecycle != lifecycle_digest:
                hard_failure, stop_reason = True, "command_drift"
                failed_fingerprints.append({
                    "stage": "full_lifecycle", "trial": trial_index, "reason": "command_drift",
                    "fingerprint": command_digest(trial_argv)[:24], "output_sha256": None,
                })
                break
            if current_source != source_digest:
                hard_failure, stop_reason = True, "source_drift"
                failed_fingerprints.append({
                    "stage": "candidate_source", "trial": trial_index, "reason": "source_drift",
                    "fingerprint": current_source[:24], "output_sha256": None,
                })
                break
            process_result = _run_bounded(
                root, trial_argv, timeout_seconds, deadline_at,
                {"CSTAR_SPRT_PHASE": "full_lifecycle", "CSTAR_SPRT_TRIAL_INDEX": str(trial_index)},
            )
            evaluation = evaluate_process(process_result, PROTECTED_STAGES)
            try:
                after_trial, _ = source_snapshot(root, candidate_sources)
                after_lifecycle, _ = source_snapshot(
                    root, (FIXED_LIFECYCLE_ARGUMENTS[0], *FIXED_LIFECYCLE_ARGUMENTS[3:]),
                )
            except RunnerError:
                after_trial = after_lifecycle = "source-unavailable"
            if after_trial != source_digest or after_lifecycle != lifecycle_digest:
                evaluation["success"], evaluation["failure_reason"] = False, "source_drift"
            tap = evaluation.get("tap", {})
            record = {
                "trial": trial_index, "argv": list(trial_argv),
                "exit_code": process_result.get("exit_code"),
                "timed_out": bool(process_result.get("timed_out")),
                "success": bool(evaluation["success"]),
                "failure_reason": evaluation.get("failure_reason"),
                "passed_tests": tap.get("passed", 0), "failed_tests": tap.get("failed", 0),
                "skipped_tests": tap.get("skipped", 0), "todo_tests": tap.get("todo", 0),
                "cancelled_tests": tap.get("cancelled", 0), "total_tests": tap.get("total", 0),
                "coverage": list(evaluation.get("coverage", [])),
                "missing_stages": list(evaluation.get("missing_stages", [])),
                "output_sha256": evaluation.get("output_sha256"),
                "stderr_sha256": evaluation.get("stderr_sha256"),
                "duration_ms": process_result.get("duration_ms", 0.0),
            }
            record["trial_hash"] = trial_hash(record)
            trials.append(record)
            trial_hashes.append(record["trial_hash"])
            coverage_by_trial.append({
                "trial": trial_index, "covered": list(record["coverage"]),
                "missing": list(record["missing_stages"]),
            })
            if record["success"]:
                passed += 1
                validator.record_trial(True)
            else:
                failed += 1
                validator.record_trial(False)
                hard_failure = True
                failed_fingerprints.extend(
                    fingerprints(evaluation, process_result, "full_lifecycle", trial_index),
                )
                stop_reason = (
                    "fail_closed_total_deadline" if process_result.get("deadline_exhausted")
                    else f"fail_closed_{record['failure_reason'] or 'trial_failure'}"
                )
                break
            if validator.status == "ACCEPT":
                stop_reason = "wald_stable"
                break
            if validator.status == "REJECT":
                stop_reason = "wald_flaky"
                break

    raw_status = str(validator.status)
    total = passed + failed
    sprt_verdict = (
        "REJECTED" if hard_failure or raw_status == "REJECT"
        else "ACCEPTED" if raw_status == "ACCEPT" and total > 0 and passed == total
        else "INCONCLUSIVE"
    )
    if sprt_verdict == "ACCEPTED" and not gungnir.get("valid"):
        sprt_verdict = "INCONCLUSIVE"
        stop_reason = "fail_closed_gungnir_evidence"
    workflow_score = round(100.0 * passed / total, 12) if total else 0.0
    covered = set(stage_result["coverage"])
    for item in coverage_by_trial:
        covered.update(item["covered"])
    missing = [stage for stage in PROTECTED_STAGES if stage not in covered]
    result: dict[str, Any] = {
        "schema": SCHEMA, "runner_mode": "host_only_deterministic",
        "checker_root": str(root),
        "candidate_source_paths": [entry["path"] for entry in source_entries],
        "candidate_source_digest": source_digest,
        "lifecycle_source_paths": [entry["path"] for entry in lifecycle_entries],
        "lifecycle_source_digest": lifecycle_digest,
        "requested_model": REQUESTED_MODEL, "actual_model": None,
        "requested_reasoning": REQUESTED_REASONING, "actual_reasoning": None,
        "model_identity": {
            "requested": {"model": REQUESTED_MODEL, "reasoning": REQUESTED_REASONING},
            "actual": None,
        },
        "external_effects": external_effects(output_dir),
        "gungnir": gungnir,
        "node_runtime": node_runtime,
        "lifecycle": {
            **{stage: stage in covered for stage in PROTECTED_STAGES},
            "cstar_record_result_called": False,
            "cstar_acceptance_authority": "independent_cstar_record_result_required",
        },
        "command_argv": {"stage_pass": stage_argv, "full_lifecycle": trial_argv},
        "command_argv_sha256": {
            "stage_pass": stage_command_sha, "full_lifecycle": trial_command_sha,
        },
        "limits": {
            "hard": {
                "max_trials": HARD_MAX_TRIALS,
                "per_process_timeout_seconds": HARD_PROCESS_TIMEOUT_SECONDS,
                "total_wall_seconds": HARD_TOTAL_WALL_SECONDS,
            },
            "effective": {
                "max_trials": max_trials, "per_process_timeout_seconds": timeout_seconds,
                "total_wall_seconds": total_wall_seconds,
            },
        },
        "timeout_seconds": timeout_seconds, "total_wall_seconds": total_wall_seconds,
        "stage_pass": stage_result,
        "stage_coverage": {
            "required": list(PROTECTED_STAGES), "stage_pass": list(stage_result["coverage"]),
            "full_lifecycle_trials": coverage_by_trial,
            "covered": [stage for stage in PROTECTED_STAGES if stage in covered], "missing": missing,
        },
        "trials": trials, "trial_hashes": trial_hashes,
        "passed": passed, "failed": failed, "total": total,
        "sprt": {
            "alpha": DEFAULT_ALPHA, "beta": DEFAULT_BETA, "p0": DEFAULT_P0, "p1": DEFAULT_P1,
            "llr": round(float(validator.log_likelihood_ratio), 12),
            "lower_boundary": round(math.log(validator.B), 12),
            "upper_boundary": round(math.log(validator.A), 12),
            "raw_status": raw_status, "passed": passed, "failed": failed, "total": total,
        },
        "workflow_score": workflow_score, "sprt_verdict": sprt_verdict,
        "cstar_acceptance": "UNVERIFIED", "stop_reason": stop_reason,
        "failed_stage_fingerprints": failed_fingerprints[:8],
        "autoresearcher": {
            "mode": "proposal_only",
            "next_action": (
                "dispatch_repair_bead" if sprt_verdict == "REJECTED"
                else "await_more_bounded_trials" if sprt_verdict == "INCONCLUSIVE" else "none"
            ),
            "failed_stage_fingerprints": failed_fingerprints[:8],
        },
        "duration_ms": round((time.monotonic() - started) * 1000.0, 12),
    }
    if output_dir is not None:
        result["receipt"] = write_receipt(root, output_dir, result)
    return result
def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run fixed host-only CStar workflow SPRT.")
    parser.add_argument("--checker-root", "--root", default=".")
    parser.add_argument("--output-dir")
    parser.add_argument("--candidate-source", dest="candidate_sources", action="append", nargs="+")
    parser.add_argument("--max-trials", type=int, default=DEFAULT_MAX_TRIALS)
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument(
        "--total-wall-seconds", type=float, default=DEFAULT_TOTAL_WALL_SECONDS,
    )
    return parser
def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(list(sys.argv[1:] if argv is None else argv))
    if not args.candidate_sources:
        _parser().error("--candidate-source is required")
    candidate_sources = [item for group in args.candidate_sources for item in group]
    try:
        result = run_workflow(
            checker_root=args.checker_root, candidate_sources=candidate_sources,
            output_dir=args.output_dir, max_trials=args.max_trials,
            timeout_seconds=args.timeout_seconds, total_wall_seconds=args.total_wall_seconds,
        )
    except RunnerError as exc:
        result = runner_error_result(exc)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["sprt_verdict"] == "ACCEPTED" else 1
if __name__ == "__main__":
    raise SystemExit(main())
