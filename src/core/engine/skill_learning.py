"""Pure skill-proposal schemas for a retired direct promotion surface.

Proposal materialization and promotion are lifecycle mutations.  They now
belong to the CStar kernel and cannot be performed through this Python module.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, NoReturn

from src.core.engine.bead_ledger import SovereignBead
from src.core.engine.hall_schema import HallSkillProposalRecord, HallValidationRun
from src.core.engine.validation_result import ValidationResult


LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR = (
    "legacy_python_sovereign_component_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR)


def _normalize_rel(path_value: Path, root: Path) -> str:
    """Return a stable slash-normalized path without touching the filesystem."""
    try:
        return str(path_value.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path_value).replace("\\", "/")


def _read_json(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


def _write_json(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


def _infer_skill_contract(root: Path, bead: SovereignBead) -> tuple[str, Path]:
    """Parse a canonical contract identity from an already-materialized bead."""
    for ref in bead.contract_refs:
        if ref.startswith("contract:"):
            skill_id = ref.split(":", 1)[1].strip()
            if skill_id:
                return skill_id, root / ".agents" / "skills" / skill_id / "contract.json"
        if ref.endswith("contract.json"):
            contract_path = Path(ref)
            if not contract_path.is_absolute():
                contract_path = root / ref
            return contract_path.parent.name, contract_path

    if bead.target_path and bead.target_path.replace("\\", "/").endswith(
        "contract.json"
    ):
        contract_path = Path(bead.target_path)
        if not contract_path.is_absolute():
            contract_path = root / bead.target_path
        return contract_path.parent.name, contract_path

    raise ValueError(
        f"Bead '{bead.id}' does not identify a canonical skill contract. "
        "Use an explicit contract:<skill> reference."
    )


def _bump_contract_version(version: str | None) -> str:
    raw = (version or "1.0").strip()
    try:
        major_text, minor_text = raw.split(".", 1)
        return f"{int(major_text)}.{int(minor_text) + 1}"
    except Exception:
        return "1.1"


def _build_proposed_contract(
    current_contract: dict[str, Any],
    *,
    focus_axes: list[str],
    validation_profile: str,
) -> dict[str, Any]:
    """Build a detached proposal payload; this function does not persist it."""
    proposed = json.loads(json.dumps(current_contract))
    proposed["version"] = _bump_contract_version(
        str(current_contract.get("version", "1.0"))
    )
    defaults = dict(proposed.get("defaults") or {})
    if focus_axes:
        defaults["focus_axes"] = list(focus_axes)
    defaults["validation_profile"] = validation_profile
    defaults.setdefault("action", "propose")
    defaults.setdefault("simulate", True)
    proposed["defaults"] = defaults
    proposed["promotion_gate"] = {
        "requires_validation_verdict": "ACCEPTED",
        "requires_sprt_verdict": "ACCEPTED",
        "requires_bead_status": "READY_FOR_REVIEW",
    }
    return proposed


def _proposal_status_from_validation(
    validation: ValidationResult, *, dry_run: bool
) -> str:
    if validation.verdict == "REJECTED":
        return "REJECTED"
    if (
        not dry_run
        and validation.verdict == "ACCEPTED"
        and validation.sprt
        and validation.sprt.verdict == "ACCEPTED"
    ):
        return "VALIDATED"
    return "PROPOSED"


@dataclass(slots=True)
class SkillProposalMaterialization:
    record: HallSkillProposalRecord
    skill_id: str
    contract_path: str
    proposal_path: str
    proposal_payload: dict[str, Any]


@dataclass(slots=True)
class SkillPromotionResult:
    status: str
    proposal_id: str
    proposal_status: str
    skill_id: str
    validation_id: str
    contract_path: str
    promotion_outcome: str
    summary: str
    bead_id: str | None = None
    resolved: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "proposal_id": self.proposal_id,
            "proposal_status": self.proposal_status,
            "skill_id": self.skill_id,
            "validation_id": self.validation_id,
            "contract_path": self.contract_path,
            "promotion_outcome": self.promotion_outcome,
            "summary": self.summary,
            "bead_id": self.bead_id,
            "resolved": self.resolved,
            "metadata": dict(self.metadata),
        }


def materialize_skill_proposal(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


def promote_skill_proposal(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()
