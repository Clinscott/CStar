from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping

GUNGNIR_SCHEMA_VERSION = "1.0"

GUNGNIR_AXIS_KEYS = (
    "logic",
    "style",
    "intel",
    "gravity",
    "vigil",
    "evolution",
    "anomaly",
    "sovereignty",
)

GUNGNIR_PROJECTION_KEYS = (
    "overall",
    "stability",
    "coupling",
    "aesthetic",
)


def _as_metric(value: Any, fallback: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return fallback
    if numeric != numeric or numeric in (float("inf"), float("-inf")):
        return fallback
    return round(numeric, 4)


def _average(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


@dataclass
class GungnirMatrix:
    version: str = GUNGNIR_SCHEMA_VERSION
    logic: float = 0.0
    style: float = 0.0
    intel: float = 0.0
    gravity: float = 0.0
    vigil: float = 0.0
    evolution: float = 0.0
    anomaly: float = 0.0
    sovereignty: float = 0.0
    overall: float = 0.0
    stability: float = 0.0
    coupling: float = 0.0
    aesthetic: float = 0.0


def build_gungnir_matrix(
    payload: Mapping[str, Any] | GungnirMatrix | None = None,
    **overrides: Any,
) -> GungnirMatrix:
    data = dict(matrix_to_dict(payload))
    data.update(overrides)

    logic = _as_metric(data.get("logic"))
    style = _as_metric(data.get("style"))
    intel = _as_metric(data.get("intel"))
    gravity = _as_metric(data.get("gravity"))
    vigil = _as_metric(data.get("vigil"))
    evolution = _as_metric(data.get("evolution"))
    anomaly = _as_metric(data.get("anomaly"))
    sovereignty = _as_metric(
        data.get("sovereignty"),
        _average([logic, style, intel, vigil, evolution]),
    )
    aesthetic = _as_metric(data.get("aesthetic"), _average([logic, style, intel]))
    stability = _as_metric(data.get("stability"), logic)
    coupling = _as_metric(data.get("coupling"), gravity)
    overall = _as_metric(
        data.get("overall"),
        _average([logic, style, intel, vigil, evolution, sovereignty]) - (anomaly * 0.5),
    )

    return GungnirMatrix(
        version=GUNGNIR_SCHEMA_VERSION,
        logic=logic,
        style=style,
        intel=intel,
        gravity=gravity,
        vigil=vigil,
        evolution=evolution,
        anomaly=anomaly,
        sovereignty=sovereignty,
        overall=overall,
        stability=stability,
        coupling=coupling,
        aesthetic=aesthetic,
    )


def patch_gungnir_matrix(
    payload: Mapping[str, Any] | GungnirMatrix | None = None,
    **patch: Any,
) -> GungnirMatrix:
    return build_gungnir_matrix(payload, **patch)


def matrix_to_dict(payload: Mapping[str, Any] | GungnirMatrix | None = None) -> dict[str, Any]:
    if payload is None:
        return {}
    if isinstance(payload, GungnirMatrix):
        return asdict(payload)
    return dict(payload)


def get_gungnir_overall(payload: Mapping[str, Any] | GungnirMatrix | None = None) -> float:
    return build_gungnir_matrix(payload).overall

