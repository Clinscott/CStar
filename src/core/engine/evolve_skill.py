"""Pure result schema for the retired direct Python evolve workflow."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


@dataclass(slots=True)
class EvolveSkillResult:
    status: str
    bead_id: str
    scan_id: str
    target_path: str
    proposal_id: str
    proposal_status: str
    skill_id: str
    contract_path: str
    validation_id: str
    verdict: str
    sprt_verdict: str
    proposal_path: str
    promotion_outcome: str
    summary: str
    claimed: bool
    resolved: bool
    emitted_beads: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _improve_scores(
    baseline: dict[str, Any], focus_axes: list[str]
) -> dict[str, Any]:
    """Return detached synthetic score data; it is not validation evidence."""
    improved = dict(baseline)
    axes = list(focus_axes or ["logic", "style"])
    for axis in axes:
        current = float(improved.get(axis, 7.0) or 0)
        improved[axis] = round(current + 0.2, 4)
    overall = float(improved.get("overall", baseline.get("overall", 7.0)) or 0)
    improved["overall"] = round(overall + 0.1, 4)
    return improved


def _claim_specific_bead(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


def _preview_bead(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


def _build_no_action_result(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


def execute_evolve(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


def execute_evolve_promotion(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()
