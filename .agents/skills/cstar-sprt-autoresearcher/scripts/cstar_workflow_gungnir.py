"""Evidence-bound adapter for the canonical TypeScript Gungnir calculus."""

from __future__ import annotations

import base64
import json
import math
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Sequence

from cstar_workflow_sprt_core import RunnerError, sha256_bytes, sha256_json


GUNGNIR_EVIDENCE_SCHEMA = "cstar.gungnir_evidence.v1"
GUNGNIR_VERSION = "1.0"
GUNGNIR_AUTHORITY = "heuristic_evidence_only"
CANONICAL_ENGINE_PATH = "src/core/engine/gungnir/calculus.ts"
CANONICAL_MATRIX_PATH = "src/types/gungnir.ts"
SCORE_KEYS = (
    "logic", "style", "intel", "vigil", "evolution", "sovereignty",
    "overall", "stability", "aesthetic",
)
NON_NEGATIVE_KEYS = ("gravity", "coupling", "anomaly")
MATRIX_KEYS = (
    "version", "logic", "style", "intel", "gravity", "vigil", "evolution",
    "anomaly", "sovereignty", "overall", "stability", "coupling", "aesthetic",
)
BREACH_SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
SCORER_PROGRAM = """\
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!payload || !Array.isArray(payload.files) || typeof payload.engine_path !== 'string') {
    throw new Error('invalid_gungnir_scorer_input');
}
const calculus = await import(pathToFileURL(payload.engine_path).href);
const supported = [...calculus.GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS];
const records = [];
const exclusions = [];
for (const file of payload.files) {
    if (!file || typeof file.path !== 'string' || typeof file.source_b64 !== 'string') {
        throw new Error('invalid_gungnir_candidate_record');
    }
    const sourceBytes = Buffer.from(file.source_b64, 'base64');
    const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
    if (sourceSha256 !== file.source_sha256) {
        throw new Error(`candidate_source_hash_mismatch:${file.path}`);
    }
    const dot = file.path.lastIndexOf('.');
    const extension = dot >= 0 ? file.path.slice(dot).toLowerCase() : '';
    if (!supported.includes(extension)) {
        exclusions.push({
            path: file.path,
            source_sha256: sourceSha256,
            reason: 'unsupported_extension',
        });
        continue;
    }
    const result = calculus.scoreGungnirSource(sourceBytes.toString('utf8'), extension);
    records.push({
        path: file.path,
        extension: result.extension,
        source_sha256: sourceSha256,
        coverage: result.coverage,
        breaches: result.breaches,
        matrix: result.matrix,
    });
}
process.stdout.write(JSON.stringify({ supported_extensions: supported, records, exclusions }));
"""
SCORER_FIXED_ARGS = (
    "--input-type=module", "--import", "<local-tsx-loader>", "--eval", SCORER_PROGRAM,
)


def _inside(root: Path, candidate: str | Path) -> tuple[Path, str]:
    resolved_root = root.resolve()
    raw = Path(candidate)
    resolved = (raw if raw.is_absolute() else resolved_root / raw).resolve()
    try:
        relative = resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise RunnerError(f"gungnir candidate path escapes checker root: {candidate}") from exc
    return resolved, relative.as_posix()


def _canonical_sources(canonical_root: Path) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for label, relative in (
        ("engine", CANONICAL_ENGINE_PATH), ("matrix_schema", CANONICAL_MATRIX_PATH),
    ):
        path, _ = _inside(canonical_root, relative)
        if not path.is_file():
            raise RunnerError(f"canonical Gungnir source is missing: {relative}")
        result[label] = {"path": relative, "sha256": sha256_bytes(path.read_bytes())}
    return result


def _candidate_payload(
    root: Path, source_paths: Sequence[str | Path],
) -> tuple[list[dict[str, str]], list[str]]:
    if not source_paths:
        return [], []
    seen: set[str] = set()
    payload: list[dict[str, str]] = []
    relative_paths: list[str] = []
    for source in source_paths:
        path, relative = _inside(root, source)
        if relative in seen:
            raise RunnerError(f"duplicate Gungnir candidate source: {relative}")
        seen.add(relative)
        if not path.is_file():
            raise RunnerError(f"Gungnir candidate source is not a file: {relative}")
        raw = path.read_bytes()
        try:
            raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise RunnerError(f"Gungnir candidate source is not UTF-8: {relative}") from exc
        payload.append({
            "path": relative,
            "source_b64": base64.b64encode(raw).decode("ascii"),
            "source_sha256": sha256_bytes(raw),
        })
        relative_paths.append(relative)
    payload.sort(key=lambda entry: entry["path"])
    return payload, sorted(relative_paths)


def _tsx_loader(canonical_root: Path) -> Path:
    loader = canonical_root / "node_modules" / "tsx" / "dist" / "loader.mjs"
    if not loader.is_file():
        raise RunnerError(f"local tsx loader is missing: {loader}")
    return loader.resolve()


def _invalid_result(
    *,
    error: str,
    candidate_count: int,
    canonical_sources: dict[str, dict[str, str]],
    command: dict[str, Any],
    process: dict[str, Any],
    exclusions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "schema": GUNGNIR_EVIDENCE_SCHEMA,
        "version": GUNGNIR_VERSION,
        "valid": False,
        "authority": GUNGNIR_AUTHORITY,
        "error": error,
        "score_scale": {"min": 0, "max": 10},
        "overall_score": None,
        "scored_count": 0,
        "candidate_count": candidate_count,
        "excluded_count": len(exclusions or []),
        "records": [],
        "exclusions": exclusions or [],
        "formula": "arithmetic_mean(records[*].matrix.overall) over scored_count",
        "canonical_sources": canonical_sources,
        "scorer_command": command,
        "process": process,
    }
    result["aggregate_evidence_sha256"] = sha256_json(result)
    return result


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _validate_matrix(matrix: Any) -> bool:
    if not isinstance(matrix, dict) or set(matrix) != set(MATRIX_KEYS):
        return False
    if matrix.get("version") != GUNGNIR_VERSION:
        return False
    if any(
        not _is_finite_number(matrix.get(key)) or not 0 <= matrix[key] <= 10
        for key in SCORE_KEYS
    ):
        return False
    return all(
        _is_finite_number(matrix.get(key)) and matrix[key] >= 0
        for key in NON_NEGATIVE_KEYS
    )


def _validate_breaches(breaches: Any) -> bool:
    if not isinstance(breaches, list):
        return False
    return all(
        isinstance(breach, dict)
        and set(breach) == {"severity", "code", "message"}
        and breach["severity"] in BREACH_SEVERITIES
        and isinstance(breach["code"], str)
        and isinstance(breach["message"], str)
        for breach in breaches
    )


def _validate_scorer_output(
    output: Any,
    payload: Sequence[dict[str, str]],
    supported_extensions: Sequence[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not isinstance(output, dict) or set(output) != {"supported_extensions", "records", "exclusions"}:
        raise ValueError("scorer_output_schema")
    if (
        not isinstance(supported_extensions, list)
        or not supported_extensions
        or any(
            not isinstance(extension, str)
            or not extension.startswith(".")
            or extension != extension.lower()
            for extension in supported_extensions
        )
        or len(set(supported_extensions)) != len(supported_extensions)
    ):
        raise ValueError("scorer_supported_extensions_schema")
    if not isinstance(output["records"], list) or not isinstance(output["exclusions"], list):
        raise ValueError("scorer_output_records_schema")
    expected = {item["path"]: item for item in payload}
    records = output["records"]
    exclusions = output["exclusions"]
    seen: set[str] = set()
    for record in records:
        if not isinstance(record, dict) or set(record) != {
            "path", "extension", "source_sha256", "coverage", "breaches", "matrix",
        }:
            raise ValueError("scorer_record_schema")
        path = record["path"]
        if path in seen or path not in expected:
            raise ValueError("scorer_record_identity")
        seen.add(path)
        candidate = expected[path]
        if record["source_sha256"] != candidate["source_sha256"]:
            raise ValueError("scorer_record_hash")
        extension = Path(path).suffix.lower()
        if (
            record["extension"] != extension
            or extension not in supported_extensions
            or not isinstance(record["coverage"], str)
        ):
            raise ValueError("scorer_record_extension_or_coverage")
        if record["coverage"] != "heuristic" or not _validate_breaches(record["breaches"]):
            raise ValueError("scorer_record_evidence_schema")
        if not _validate_matrix(record["matrix"]):
            raise ValueError("scorer_record_matrix_schema")
    for exclusion in exclusions:
        if not isinstance(exclusion, dict) or set(exclusion) != {"path", "source_sha256", "reason"}:
            raise ValueError("scorer_exclusion_schema")
        path = exclusion["path"]
        if path in seen or path not in expected or exclusion["reason"] != "unsupported_extension":
            raise ValueError("scorer_exclusion_identity")
        seen.add(path)
        if exclusion["source_sha256"] != expected[path]["source_sha256"]:
            raise ValueError("scorer_exclusion_hash")
        if Path(path).suffix.lower() in supported_extensions:
            raise ValueError("scorer_supported_file_excluded")
    if seen != set(expected):
        raise ValueError("scorer_candidate_coverage")
    if (
        [item["path"] for item in records] != sorted(item["path"] for item in records)
        or [item["path"] for item in exclusions] != sorted(item["path"] for item in exclusions)
    ):
        raise ValueError("scorer_candidate_order")
    return records, exclusions


def _record_with_hash(record: dict[str, Any]) -> dict[str, Any]:
    stable = {
        "path": record["path"],
        "extension": record["extension"],
        "source_sha256": record["source_sha256"],
        "coverage": record["coverage"],
        "breaches": record["breaches"],
        "matrix": record["matrix"],
    }
    return {**stable, "evidence_sha256": sha256_json(stable)}


def score_candidate_sources(
    root: Path,
    source_paths: Sequence[str | Path],
    *,
    node_runtime: dict[str, Any],
    deadline_at: float,
    process_cap: float,
    canonical_root: Path | None = None,
) -> dict[str, Any]:
    """Run the canonical calculus once and return only bounded evidence."""
    canonical_root = (canonical_root or Path(__file__).resolve().parents[4]).resolve()
    canonical_sources = _canonical_sources(canonical_root)
    payload, relative_paths = _candidate_payload(root, source_paths)
    selected = node_runtime.get("selected")
    loader = _tsx_loader(canonical_root)
    fixed_command = {
        "args": list(SCORER_FIXED_ARGS),
        "sha256": sha256_json(list(SCORER_FIXED_ARGS)),
    }
    command = [
        str(selected["path"]) if isinstance(selected, dict) else "",
        "--input-type=module", "--import", str(loader), "--eval", SCORER_PROGRAM,
    ]
    command_evidence = {
        "fixed_scorer_command_sha256": fixed_command["sha256"],
        "argv_sha256": sha256_json(command),
        "node_path": command[0] or None,
    }
    base_process = {
        "exit_code": None, "timed_out": False, "spawn_error": None,
        "stdout_sha256": None, "stderr_sha256": None, "duration_ms": 0.0,
    }
    if not selected:
        return _invalid_result(
            error="no_compatible_node_for_gungnir_scorer",
            candidate_count=len(payload), canonical_sources=canonical_sources,
            command=command_evidence, process=base_process,
        )
    remaining = deadline_at - time.monotonic()
    if remaining <= 0:
        base_process["timed_out"] = True
        return _invalid_result(
            error="gungnir_scorer_total_deadline_exhausted",
            candidate_count=len(payload), canonical_sources=canonical_sources,
            command=command_evidence,
            process={**base_process, "timed_out": True},
        )
    scorer_input = json.dumps({
        "engine_path": str((canonical_root / CANONICAL_ENGINE_PATH).resolve()),
        "files": payload,
    }, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    started = time.monotonic()
    env = os.environ.copy()
    env.update({
        "CSTAR_SPRT_AUTORESEARCHER_HOST_ONLY": "1",
        "CSTAR_SPRT_AUTORESEARCHER_EXTERNAL_EFFECTS": "none",
        "PYTHONDONTWRITEBYTECODE": "1",
        "NODE_OPTIONS": "",
        "NODE_PATH": "",
    })
    process: dict[str, Any]
    try:
        completed = subprocess.run(
            command, cwd=str(root.resolve()), env=env, input=scorer_input,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=min(process_cap, remaining),
            shell=False, check=False,
        )
        stdout = completed.stdout or b""
        stderr = completed.stderr or b""
        process = {
            "exit_code": completed.returncode, "timed_out": False, "spawn_error": None,
            "stdout_sha256": sha256_bytes(stdout), "stderr_sha256": sha256_bytes(stderr),
            "duration_ms": round((time.monotonic() - started) * 1000.0, 12),
        }
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout or b""
        stderr = exc.stderr or b""
        if isinstance(stdout, str):
            stdout = stdout.encode()
        if isinstance(stderr, str):
            stderr = stderr.encode()
        process = {
            "exit_code": None, "timed_out": True, "spawn_error": None,
            "stdout_sha256": sha256_bytes(stdout), "stderr_sha256": sha256_bytes(stderr),
            "duration_ms": round((time.monotonic() - started) * 1000.0, 12),
        }
    except OSError as exc:
        process = {
            "exit_code": None, "timed_out": False,
            "spawn_error": f"{type(exc).__name__}: {exc}",
            "stdout_sha256": sha256_bytes(b""), "stderr_sha256": sha256_bytes(b""),
            "duration_ms": round((time.monotonic() - started) * 1000.0, 12),
        }
        stdout = b""
    if process["timed_out"]:
        error = "gungnir_scorer_timeout"
    elif process["spawn_error"]:
        error = "gungnir_scorer_spawn_error"
    elif process["exit_code"] != 0:
        error = "gungnir_scorer_process_failure"
    else:
        try:
            output = json.loads(stdout.decode("utf-8"))
            supported = output.get("supported_extensions") if isinstance(output, dict) else []
            records, exclusions = _validate_scorer_output(output, payload, supported)
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError, TypeError, ValueError) as exc:
            error = f"gungnir_scorer_invalid_output:{exc}"
        else:
            if not records:
                return _invalid_result(
                    error="zero_scoreable_candidates",
                    candidate_count=len(payload), canonical_sources=canonical_sources,
                    command=command_evidence, process=process, exclusions=exclusions,
                )
            records_with_hashes = [_record_with_hash(record) for record in records]
            aggregate_material = {
                "schema": GUNGNIR_EVIDENCE_SCHEMA, "version": GUNGNIR_VERSION,
                "score_scale": {"min": 0, "max": 10},
                "overall_score": sum(record["matrix"]["overall"] for record in records) / len(records),
                "scored_count": len(records), "candidate_count": len(payload),
                "excluded_count": len(exclusions), "records": records_with_hashes,
                "exclusions": exclusions,
                "formula": "arithmetic_mean(records[*].matrix.overall) over scored_count",
                "canonical_sources": canonical_sources, "scorer_command": command_evidence,
                "process_evidence": {
                    "exit_code": process["exit_code"],
                    "stdout_sha256": process["stdout_sha256"],
                    "stderr_sha256": process["stderr_sha256"],
                },
                "authority": GUNGNIR_AUTHORITY,
            }
            return {
                **aggregate_material,
                "valid": True,
                "aggregate_evidence_sha256": sha256_json(aggregate_material),
                "process": process,
                "candidate_source_paths": relative_paths,
            }
    return _invalid_result(
        error=error, candidate_count=len(payload), canonical_sources=canonical_sources,
        command=command_evidence, process=process,
    )
