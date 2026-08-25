from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / ".agents" / "skills" / "cstar-sprt-autoresearcher" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import cstar_workflow_gungnir as gungnir  # noqa: E402
import cstar_workflow_sprt_core as core  # noqa: E402
import run_cstar_workflow_sprt as runner  # noqa: E402


@pytest.fixture(scope="module")
def node_runtime() -> dict[str, object]:
    return runner.select_compatible_node(ROOT, time.monotonic() + 30.0)


def _score(
    tmp_path: Path,
    node_runtime: dict[str, object],
    *relative_paths: str,
) -> dict[str, object]:
    return gungnir.score_candidate_sources(
        tmp_path,
        [tmp_path / relative for relative in relative_paths],
        node_runtime=node_runtime,
        deadline_at=time.monotonic() + 30.0,
        process_cap=30.0,
    )


def _write_candidates(tmp_path: Path) -> None:
    (tmp_path / "clean.ts").write_text(
        "export const value = 1;\n", encoding="utf-8",
    )
    (tmp_path / "coupled.ts").write_text(
        "\n".join(
            f"import dependency{index} from 'dependency-{index}';"
            for index in range(11)
        ) + "\nexport const value = 1;\n",
        encoding="utf-8",
    )
    (tmp_path / "contract.feature").write_text(
        "Feature: unsupported fixture\n", encoding="utf-8",
    )


def test_canonical_score_is_deterministic_and_uses_mean_denominator(
    tmp_path: Path, node_runtime: dict[str, object],
) -> None:
    _write_candidates(tmp_path)
    first = _score(tmp_path, node_runtime, "clean.ts", "coupled.ts", "contract.feature")
    second = _score(tmp_path, node_runtime, "clean.ts", "coupled.ts", "contract.feature")

    assert first["valid"] is True
    assert first["aggregate_evidence_sha256"] == second["aggregate_evidence_sha256"]
    assert first["candidate_count"] == 3
    assert first["scored_count"] == 2
    assert first["excluded_count"] == 1
    records = first["records"]
    assert isinstance(records, list)
    assert [record["path"] for record in records] == ["clean.ts", "coupled.ts"]
    expected = sum(record["matrix"]["overall"] for record in records) / 2
    assert first["overall_score"] == expected
    assert first["formula"] == "arithmetic_mean(records[*].matrix.overall) over scored_count"
    assert first["authority"] == "heuristic_evidence_only"
    assert first["canonical_sources"]["engine"]["path"] == "src/core/engine/gungnir/calculus.ts"
    assert first["canonical_sources"]["matrix_schema"]["path"] == "src/types/gungnir.ts"


def test_file_and_aggregate_evidence_hashes_bind_canonical_records(
    tmp_path: Path, node_runtime: dict[str, object],
) -> None:
    _write_candidates(tmp_path)
    result = _score(tmp_path, node_runtime, "clean.ts", "contract.feature")
    assert result["valid"] is True
    record = result["records"][0]
    stable_record = {key: record[key] for key in (
        "path", "extension", "source_sha256", "coverage", "breaches", "matrix",
    )}
    assert record["evidence_sha256"] == core.sha256_json(stable_record)
    aggregate_material = {key: result[key] for key in (
        "schema", "version", "score_scale", "overall_score", "scored_count",
        "candidate_count", "excluded_count", "records", "exclusions", "formula",
        "canonical_sources", "scorer_command", "authority",
    )}
    aggregate_material["process_evidence"] = result["process_evidence"]
    assert result["aggregate_evidence_sha256"] == core.sha256_json(aggregate_material)
    raw = (tmp_path / "clean.ts").read_bytes()
    assert record["source_sha256"] == hashlib.sha256(raw).hexdigest()


def test_unsupported_candidates_are_explicitly_excluded(
    tmp_path: Path, node_runtime: dict[str, object],
) -> None:
    _write_candidates(tmp_path)
    result = _score(tmp_path, node_runtime, "contract.feature")
    assert result["valid"] is False
    assert result["error"] == "zero_scoreable_candidates"
    assert result["scored_count"] == 0
    assert result["excluded_count"] == 1
    assert result["exclusions"] == [{
        "path": "contract.feature",
        "source_sha256": hashlib.sha256((tmp_path / "contract.feature").read_bytes()).hexdigest(),
        "reason": "unsupported_extension",
    }]


def test_no_compatible_runtime_fails_closed_without_scorer_invocation(tmp_path: Path) -> None:
    (tmp_path / "candidate.ts").write_text("export const value = 1;\n", encoding="utf-8")
    result = gungnir.score_candidate_sources(
        tmp_path, ["candidate.ts"], node_runtime={"selected": None},
        deadline_at=time.monotonic() + 30.0, process_cap=30.0,
    )
    assert result["valid"] is False
    assert result["error"] == "no_compatible_node_for_gungnir_scorer"
    assert result["process"]["exit_code"] is None


@pytest.mark.parametrize(
    ("returncode", "stdout", "error"),
    [
        (1, b"", "gungnir_scorer_process_failure"),
        (0, b"not-json", "gungnir_scorer_invalid_output:Expecting value"),
    ],
)
def test_process_and_output_failures_are_inconclusive(
    tmp_path: Path,
    node_runtime: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    returncode: int,
    stdout: bytes,
    error: str,
) -> None:
    (tmp_path / "candidate.ts").write_text("export const value = 1;\n", encoding="utf-8")

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[bytes]:
        return subprocess.CompletedProcess(args[0], returncode, stdout=stdout, stderr=b"")

    monkeypatch.setattr(gungnir.subprocess, "run", fake_run)
    result = _score(tmp_path, node_runtime, "candidate.ts")
    assert result["valid"] is False
    assert str(result["error"]).startswith(error)
    assert result["aggregate_evidence_sha256"]


def test_scorer_timeout_fails_closed(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, node_runtime: dict[str, object]) -> None:
    (tmp_path / "candidate.ts").write_text("export const value = 1;\n", encoding="utf-8")

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[bytes]:
        raise subprocess.TimeoutExpired(args[0], 0.01, output=b"partial", stderr=b"timeout")

    monkeypatch.setattr(gungnir.subprocess, "run", fake_run)
    result = _score(tmp_path, node_runtime, "candidate.ts")
    assert result["valid"] is False
    assert result["error"] == "gungnir_scorer_timeout"
    assert result["process"]["timed_out"] is True


def test_candidate_and_symlink_escape_fail_closed(tmp_path: Path, node_runtime: dict[str, object]) -> None:
    with pytest.raises(core.RunnerError, match="escapes checker root"):
        _score(tmp_path, node_runtime, "/etc/hosts")
    link = tmp_path / "outside.ts"
    try:
        os.symlink("/etc/hosts", link)
    except OSError as exc:
        pytest.skip(f"symlink unavailable: {exc}")
    with pytest.raises(core.RunnerError, match="escapes checker root"):
        _score(tmp_path, node_runtime, "outside.ts")


def test_scoring_is_read_only_and_does_not_create_receipts(
    tmp_path: Path, node_runtime: dict[str, object],
) -> None:
    _write_candidates(tmp_path)
    before = sorted(path.relative_to(tmp_path).as_posix() for path in tmp_path.rglob("*"))
    result = _score(tmp_path, node_runtime, "clean.ts", "contract.feature")
    after = sorted(path.relative_to(tmp_path).as_posix() for path in tmp_path.rglob("*"))
    assert result["valid"] is True
    assert before == after
    assert not (tmp_path / "receipt.json").exists()


def test_sprt_contract_remains_separate_from_gungnir_evidence(tmp_path: Path) -> None:
    checker = tmp_path / "checker"
    checker.mkdir()
    assert core.PROTECTED_STAGES[-1] == "closeout_terminal"
    assert core.SCHEMA == "cstar.workflow_sprt_autoresearcher.v1"
    assert gungnir.GUNGNIR_AUTHORITY == "heuristic_evidence_only"
    assert not (checker / "receipt.json").exists()
