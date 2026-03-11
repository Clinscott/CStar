from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Mapping

from src.core.engine.gungnir.schema import (
    GUNGNIR_AXIS_KEYS,
    GUNGNIR_PROJECTION_KEYS,
    GungnirMatrix,
    build_gungnir_matrix,
    matrix_to_dict,
)
from src.core.engine.hall_schema import HallOfRecords, HallValidationRun

ValidationVerdict = Literal["ACCEPTED", "REJECTED", "INCONCLUSIVE"]
BenchmarkStatus = Literal["PASS", "FAIL", "SKIPPED"]
CheckStatus = Literal["PASS", "FAIL", "SKIPPED"]

PROMOTION_BLOCKING_AXES = ("logic", "style", "sovereignty")


def _round_metric(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    if numeric != numeric or numeric in (float("inf"), float("-inf")):
        return 0.0
    return round(numeric, 4)


@dataclass(slots=True)
class ScoreDelta:
    before: GungnirMatrix = field(default_factory=GungnirMatrix)
    after: GungnirMatrix = field(default_factory=GungnirMatrix)
    delta: dict[str, float] = field(default_factory=dict)
    improved_axes: list[str] = field(default_factory=list)
    regressed_axes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "before": matrix_to_dict(self.before),
            "after": matrix_to_dict(self.after),
            "delta": dict(self.delta),
            "improved_axes": list(self.improved_axes),
            "regressed_axes": list(self.regressed_axes),
        }


@dataclass(slots=True)
class BenchmarkResult:
    status: BenchmarkStatus
    summary: str
    trials: int = 0
    avg_latency_ms: float = 0.0
    min_latency_ms: float | None = None
    max_latency_ms: float | None = None
    stddev_latency_ms: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class SprtVerdict:
    verdict: ValidationVerdict
    summary: str
    llr: float
    passed: int
    total: int
    lower_bound: float
    upper_bound: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ValidationCheck:
    name: str
    status: CheckStatus
    details: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ValidationResult:
    validation_id: str
    verdict: ValidationVerdict
    summary: str
    score_delta: ScoreDelta
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    benchmark: BenchmarkResult | None = None
    sprt: SprtVerdict | None = None
    checks: list[ValidationCheck] = field(default_factory=list)
    blocking_reasons: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "validation_id": self.validation_id,
            "verdict": self.verdict,
            "summary": self.summary,
            "score_delta": self.score_delta.to_dict(),
            "created_at": self.created_at,
            "benchmark": self.benchmark.to_dict() if self.benchmark else None,
            "sprt": self.sprt.to_dict() if self.sprt else None,
            "checks": [check.to_dict() for check in self.checks],
            "blocking_reasons": list(self.blocking_reasons),
            "metadata": dict(self.metadata),
        }

    def to_hall_run(
        self,
        repo_id: str,
        *,
        scan_id: str | None = None,
        bead_id: str | None = None,
        target_path: str | None = None,
        notes: str | None = None,
        legacy_trace_id: int | None = None,
    ) -> HallValidationRun:
        return HallValidationRun(
            validation_id=self.validation_id,
            repo_id=repo_id,
            scan_id=scan_id,
            bead_id=bead_id,
            target_path=target_path,
            verdict=self.verdict,
            sprt_verdict=self.sprt.verdict if self.sprt else None,
            pre_scores=matrix_to_dict(self.score_delta.before),
            post_scores=matrix_to_dict(self.score_delta.after),
            benchmark=self.benchmark.to_dict() if self.benchmark else {},
            notes=notes or self.summary,
            created_at=self.created_at,
            legacy_trace_id=legacy_trace_id,
        )


def create_score_delta(
    before: Mapping[str, Any] | GungnirMatrix | None = None,
    after: Mapping[str, Any] | GungnirMatrix | None = None,
) -> ScoreDelta:
    before_matrix = build_gungnir_matrix(before)
    after_matrix = build_gungnir_matrix(after)
    delta: dict[str, float] = {}
    improved_axes: list[str] = []
    regressed_axes: list[str] = []

    for key in (*GUNGNIR_AXIS_KEYS, *GUNGNIR_PROJECTION_KEYS):
        change = _round_metric(getattr(after_matrix, key) - getattr(before_matrix, key))
        delta[key] = change
        if change > 0:
            improved_axes.append(key)
        elif change < 0:
            regressed_axes.append(key)

    return ScoreDelta(
        before=before_matrix,
        after=after_matrix,
        delta=delta,
        improved_axes=improved_axes,
        regressed_axes=regressed_axes,
    )


def create_benchmark_result(
    *,
    status: BenchmarkStatus,
    summary: str,
    trials: int = 0,
    avg_latency_ms: float = 0.0,
    min_latency_ms: float | None = None,
    max_latency_ms: float | None = None,
    stddev_latency_ms: float | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> BenchmarkResult:
    return BenchmarkResult(
        status=status,
        summary=summary,
        trials=int(trials),
        avg_latency_ms=_round_metric(avg_latency_ms),
        min_latency_ms=_round_metric(min_latency_ms) if min_latency_ms is not None else None,
        max_latency_ms=_round_metric(max_latency_ms) if max_latency_ms is not None else None,
        stddev_latency_ms=_round_metric(stddev_latency_ms) if stddev_latency_ms is not None else None,
        metadata=dict(metadata or {}),
    )


def create_sprt_verdict(
    *,
    verdict: ValidationVerdict,
    summary: str,
    llr: float,
    passed: int,
    total: int,
    lower_bound: float,
    upper_bound: float,
) -> SprtVerdict:
    return SprtVerdict(
        verdict=verdict,
        summary=summary,
        llr=_round_metric(llr),
        passed=int(passed),
        total=int(total),
        lower_bound=_round_metric(lower_bound),
        upper_bound=_round_metric(upper_bound),
    )


def create_validation_result(
    *,
    before: Mapping[str, Any] | GungnirMatrix | None = None,
    after: Mapping[str, Any] | GungnirMatrix | None = None,
    benchmark: BenchmarkResult | None = None,
    sprt: SprtVerdict | None = None,
    checks: list[ValidationCheck] | None = None,
    summary: str | None = None,
    validation_id: str | None = None,
    metadata: Mapping[str, Any] | None = None,
    allow_regression_override: bool = False,
) -> ValidationResult:
    score_delta = create_score_delta(before, after)
    check_list = list(checks or [])
    blocking_reasons: list[str] = []

    if not allow_regression_override:
        for axis in PROMOTION_BLOCKING_AXES:
            if score_delta.delta.get(axis, 0.0) < 0:
                blocking_reasons.append(f"Gungnir axis '{axis}' regressed by {score_delta.delta[axis]:.4f}.")

    for check in check_list:
        if check.status == "FAIL":
            blocking_reasons.append(f"Validation check '{check.name}' failed.")

    if benchmark and benchmark.status == "FAIL":
        blocking_reasons.append(f"Benchmark failed: {benchmark.summary}")

    if sprt and sprt.verdict == "REJECTED":
        blocking_reasons.append(f"SPRT rejected candidate: {sprt.summary}")

    if blocking_reasons:
        verdict: ValidationVerdict = "REJECTED"
    elif sprt and sprt.verdict == "INCONCLUSIVE":
        verdict = "INCONCLUSIVE"
    else:
        verdict = "ACCEPTED"

    result_summary = summary
    if result_summary is None:
        if verdict == "ACCEPTED":
            result_summary = "Validation accepted. Candidate may advance."
        elif verdict == "INCONCLUSIVE":
            result_summary = "Validation inconclusive. More evidence is required before promotion."
        else:
            result_summary = "Validation rejected. Promotion gate remains closed."

    return ValidationResult(
        validation_id=validation_id or f"validation:{uuid.uuid4().hex[:12]}",
        verdict=verdict,
        summary=result_summary,
        score_delta=score_delta,
        benchmark=benchmark,
        sprt=sprt,
        checks=check_list,
        blocking_reasons=blocking_reasons,
        metadata=dict(metadata or {}),
    )


def save_validation_result(
    project_root: str,
    result: ValidationResult,
    *,
    scan_id: str | None = None,
    bead_id: str | None = None,
    target_path: str | None = None,
    notes: str | None = None,
    legacy_trace_id: int | None = None,
) -> HallValidationRun:
    hall = HallOfRecords(project_root)
    repo = hall.bootstrap_repository()
    record = result.to_hall_run(
        repo.repo_id,
        scan_id=scan_id,
        bead_id=bead_id,
        target_path=target_path,
        notes=notes,
        legacy_trace_id=legacy_trace_id,
    )
    hall.save_validation_run(record)
    return record
