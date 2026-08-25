from pathlib import Path
from unittest.mock import MagicMock

import pytest

from src.core.engine.validation_result import (
    LEGACY_VALIDATION_PERSISTENCE_ERROR,
    ValidationCheck,
    ValidationEvidence,
    create_benchmark_result,
    create_sprt_verdict,
    create_validation_result,
    save_validation_result,
)
from src.core.engine.ravens.muninn_crucible import MuninnCrucible


def test_validation_result_accepts_when_checks_and_scores_hold() -> None:
    result = create_validation_result(
        before={"logic": 8.0, "style": 7.0, "sovereignty": 7.5, "overall": 7.5},
        after={"logic": 8.5, "style": 7.1, "sovereignty": 7.6, "overall": 7.9},
        benchmark=create_benchmark_result(
            status="PASS",
            summary="Latency within envelope.",
            trials=3,
            avg_latency_ms=82.1,
        ),
        sprt=create_sprt_verdict(
            verdict="ACCEPTED",
            summary="PASS (Accepted)",
            llr=3.8,
            passed=10,
            total=10,
            lower_bound=-2.9,
            upper_bound=2.9,
        ),
        checks=[ValidationCheck(name="crucible", status="PASS")],
        evidence=ValidationEvidence(
            validator_identity="independent:test-validator",
            evidence_sha256="a" * 64,
            independent_of_execution=True,
            evaluated_checks=1,
        ),
    )

    assert result.verdict == "ACCEPTED"
    assert result.blocking_reasons == []
    assert result.evidence_gaps == []
    assert result.score_delta.delta["logic"] == 0.5


def test_validation_result_rejects_on_negative_protected_axis() -> None:
    result = create_validation_result(
        before={"logic": 8.0, "style": 8.0, "sovereignty": 8.0, "overall": 8.0},
        after={"logic": 7.5, "style": 8.1, "sovereignty": 8.0, "overall": 7.9},
        checks=[ValidationCheck(name="crucible", status="PASS")],
        evidence=ValidationEvidence(
            validator_identity="independent:test-validator",
            evidence_sha256="b" * 64,
            independent_of_execution=True,
            evaluated_checks=1,
        ),
    )

    assert result.verdict == "REJECTED"
    assert any("logic" in reason for reason in result.blocking_reasons)


def test_validation_result_remains_inconclusive_when_sprt_is_unresolved() -> None:
    result = create_validation_result(
        before={"logic": 8.0, "style": 8.0, "sovereignty": 8.0, "overall": 8.0},
        after={"logic": 8.1, "style": 8.0, "sovereignty": 8.0, "overall": 8.05},
        sprt=create_sprt_verdict(
            verdict="INCONCLUSIVE",
            summary="Need a larger sample.",
            llr=0.2,
            passed=6,
            total=10,
            lower_bound=-2.9,
            upper_bound=2.9,
        ),
        checks=[ValidationCheck(name="crucible", status="PASS")],
    )

    assert result.verdict == "INCONCLUSIVE"
    assert result.blocking_reasons == []


def test_validation_result_is_inconclusive_without_independent_evidence() -> None:
    result = create_validation_result(
        checks=[ValidationCheck(name="focused-tests", status="PASS")]
    )

    assert result.verdict == "INCONCLUSIVE"
    assert "evidence is missing" in " ".join(result.evidence_gaps).lower()


def test_validation_result_is_inconclusive_with_zero_sprt_denominator() -> None:
    result = create_validation_result(
        checks=[ValidationCheck(name="focused-tests", status="PASS")],
        sprt=create_sprt_verdict(
            verdict="ACCEPTED",
            summary="Caller claimed acceptance without observations.",
            llr=0,
            passed=0,
            total=0,
            lower_bound=-1,
            upper_bound=1,
        ),
        evidence=ValidationEvidence(
            validator_identity="independent:test-validator",
            evidence_sha256="c" * 64,
            independent_of_execution=True,
            evaluated_checks=1,
        ),
    )

    assert result.verdict == "INCONCLUSIVE"
    assert "zero sample denominator" in " ".join(result.evidence_gaps).lower()


def test_muninn_crucible_emits_canonical_validation_result(tmp_path: Path) -> None:
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_ravens_engine_retired_use_cstar_kernel$",
    ):
        MuninnCrucible(tmp_path, MagicMock())


def test_direct_validation_persistence_fails_before_hall_access(tmp_path: Path) -> None:
    result = create_validation_result(summary="Synthetic detached result.")

    with pytest.raises(
        RuntimeError,
        match=f"^{LEGACY_VALIDATION_PERSISTENCE_ERROR}$",
    ):
        save_validation_result(str(tmp_path), result, bead_id="bead:synthetic")
