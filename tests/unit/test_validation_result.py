from src.core.engine.validation_result import (
    ValidationCheck,
    create_benchmark_result,
    create_sprt_verdict,
    create_validation_result,
)


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
