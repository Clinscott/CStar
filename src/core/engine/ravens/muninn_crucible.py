"""Pure Ravens validation-request schemas for a retired autonomous crucible."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, NoReturn

from src.core.engine.forge_candidate import ForgeValidationRequest, GeneratedTestArtifact
from src.core.engine.ravens_stage import RavensTargetIdentity


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


@dataclass(slots=True)
class PreparedCandidate:
    target: RavensTargetIdentity
    file_path: Path
    test_path: Path
    fix_content: str
    candidate_source: str
    staged_candidate_path: Path | None = None


class MuninnCrucible:
    """Preserve detached request coercion; reject every executable operation."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    @staticmethod
    def _target_identity(target: dict[str, Any]) -> RavensTargetIdentity:
        return RavensTargetIdentity(
            target_kind=target.get("target_kind", "FILE"),
            target_path=target.get("file"),
            bead_id=target.get("bead_id"),
            rationale=target.get("action"),
            acceptance_criteria=target.get("acceptance_criteria"),
            baseline_scores=dict(target.get("metrics") or {}),
            compatibility_source=target.get(
                "compatibility_source", "legacy:mission-coordinator"
            ),
        )

    @staticmethod
    def _coerce_validation_request(
        request: ForgeValidationRequest | dict[str, Any],
    ) -> ForgeValidationRequest:
        if isinstance(request, ForgeValidationRequest):
            return request
        generated_tests = [
            artifact
            if isinstance(artifact, GeneratedTestArtifact)
            else GeneratedTestArtifact(**artifact)
            for artifact in (request.get("generated_tests") or [])
        ]
        return ForgeValidationRequest(
            bead_id=str(request.get("bead_id") or ""),
            candidate_id=str(request.get("candidate_id") or ""),
            repo_id=str(request.get("repo_id") or ""),
            scan_id=str(request.get("scan_id") or ""),
            target_path=str(request.get("target_path") or ""),
            staged_path=str(request.get("staged_path") or ""),
            contract_refs=list(request.get("contract_refs") or []),
            acceptance_criteria=str(request.get("acceptance_criteria") or ""),
            required_validations=list(request.get("required_validations") or []),
            baseline_scores=dict(request.get("baseline_scores") or {}),
            generated_tests=generated_tests,
        )

    @classmethod
    def build_validation_target_from_request(
        cls,
        request: ForgeValidationRequest | dict[str, Any],
        *,
        mission_id: str | None = None,
    ) -> dict[str, Any]:
        handoff = cls._coerce_validation_request(request)
        return {
            "mission_id": mission_id or handoff.candidate_id,
            "candidate_id": handoff.candidate_id,
            "bead_id": handoff.bead_id,
            "scan_id": handoff.scan_id,
            "file": handoff.target_path,
            "target_kind": "FILE",
            "action": handoff.acceptance_criteria
            or f"Validate forge candidate {handoff.candidate_id}",
            "acceptance_criteria": handoff.acceptance_criteria,
            "contract_refs": list(handoff.contract_refs),
            "metrics": dict(handoff.baseline_scores),
            "compatibility_source": "forge:validation_request",
            "required_validations": list(handoff.required_validations),
            "generated_tests": [
                artifact.to_dict() for artifact in handoff.generated_tests
            ],
            "staged_candidate_path": handoff.staged_path,
            "validation_request": handoff.to_dict(),
        }

    @classmethod
    def _normalize_validation_target(
        cls, target: dict[str, Any]
    ) -> dict[str, Any]:
        validation_request = target.get("validation_request")
        if validation_request is None:
            return dict(target)
        normalized = cls.build_validation_target_from_request(
            validation_request, mission_id=target.get("mission_id")
        )
        for key, value in target.items():
            if key != "validation_request" and value is not None:
                normalized[key] = value
        return normalized

    def _resolve_generated_test_path(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    async def generate_gauntlet(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    async def generate_steel(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    async def prepare_candidate(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    async def execute_validation_stage(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def verify_fix_result(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def verify_fix(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def apply_fix(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def rollback(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
