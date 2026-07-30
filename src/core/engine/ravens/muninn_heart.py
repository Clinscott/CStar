"""Retired autonomous Ravens cycle coordinator with pure target parsing only."""

from __future__ import annotations

from typing import Any, NoReturn

from src.core.engine.ravens_stage import RavensTargetIdentity


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


class MuninnHeart:
    """Fail before Git, Hall, provider, filesystem, or lifecycle effects."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    @property
    def agent_id(self) -> str:
        return "MUNINN"

    @staticmethod
    def _target_from_mission(mission: dict[str, Any]) -> RavensTargetIdentity:
        """Parse detached mission data into the canonical target schema."""
        return RavensTargetIdentity(
            target_kind=mission.get("target_kind", "FILE"),
            target_ref=mission.get("target_ref"),
            target_path=mission.get("file") or mission.get("target_path"),
            bead_id=mission.get("bead_id"),
            rationale=mission.get("action"),
            acceptance_criteria=mission.get("acceptance_criteria"),
            baseline_scores=dict(mission.get("metrics") or {}),
            compatibility_source=mission.get(
                "compatibility_source", "legacy:mission-coordinator"
            ),
        )

    async def _run_behavioral_pulse(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def _repo_id(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _memory_stage(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _hunt_stage(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    async def execute_cycle_contract(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    async def execute_cycle(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _wait_for_silence(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _repository_activity_snapshot(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()
