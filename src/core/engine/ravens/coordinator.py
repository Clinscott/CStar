"""Pure score helpers for a retired autonomous mission coordinator."""

from __future__ import annotations

from typing import Any, NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


class MissionCoordinator:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def select_mission(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _bead_to_mission(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _select_legacy_projected_mission(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    @staticmethod
    def _initial_score_from_metrics(
        target_metric: str, metrics: dict[str, Any]
    ) -> float:
        score_map = {
            "LOGIC": metrics.get("logic", 5.0),
            "STYLE": metrics.get("style", 5.0),
            "INTEL": metrics.get("intel", 5.0),
            "STABILITY": metrics.get("stability", 0.5) * 10,
            "COUPLING": (1.0 - metrics.get("coupling", 0.5)) * 10,
            "ANOMALY": (1.0 - metrics.get("anomaly", 0.0)) * 10,
            "OVERALL": metrics.get("overall", metrics.get("logic", 5.0)),
        }
        return float(score_map.get(target_metric, metrics.get("logic", 5.0)) or 0.0)

    @staticmethod
    def _legacy_sort(breaches: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not breaches:
            return None
        severity_map = {"CRITICAL": 100, "HIGH": 80, "MEDIUM": 50, "LOW": 20}
        return max(
            breaches,
            key=lambda breach: severity_map.get(
                str(breach.get("severity", "LOW")).upper(), 0
            ),
        )
