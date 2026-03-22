from pathlib import Path
from unittest.mock import MagicMock, patch

from src.core.engine.validation_result import (
    ValidationCheck,
    create_benchmark_result,
    create_sprt_verdict,
    create_validation_result,
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
    )

    assert result.verdict == "ACCEPTED"
    assert result.blocking_reasons == []
    assert result.score_delta.delta["logic"] == 0.5


def test_validation_result_rejects_on_negative_protected_axis() -> None:
    result = create_validation_result(
        before={"logic": 8.0, "style": 8.0, "sovereignty": 8.0, "overall": 8.0},
        after={"logic": 7.5, "style": 8.1, "sovereignty": 8.0, "overall": 7.9},
        checks=[ValidationCheck(name="crucible", status="PASS")],
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


def test_muninn_crucible_emits_canonical_validation_result(tmp_path: Path) -> None:
    crucible = MuninnCrucible(tmp_path, MagicMock())
    with patch("src.core.engine.ravens.muninn_crucible.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="1 passed", stderr="")
        result = crucible.verify_fix_result(
            tmp_path / "tests" / "gauntlet" / "test_sample.py",
            before_scores={"logic": 7.0, "style": 7.0, "sovereignty": 7.0, "overall": 7.0},
            after_scores={"logic": 7.1, "style": 7.2, "sovereignty": 7.0, "overall": 7.1},
        )

        assert result.verdict == "ACCEPTED"
        assert result.benchmark is not None
        assert result.checks[0].name == "crucible"
        assert crucible.verify_fix(tmp_path / "tests" / "gauntlet" / "test_sample.py") is True
