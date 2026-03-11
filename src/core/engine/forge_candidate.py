from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from src.core.engine.bead_ledger import BeadLedger
from src.tools.generate_tests import generate_candidate_tests

CANONICAL_FORGE_ELIGIBLE_STATUSES = {"OPEN", "IN_PROGRESS"}


@dataclass(slots=True)
class ForgeCandidateRequest:
    bead_id: str
    repo_id: str
    scan_id: str
    target_path: str
    rationale: str
    contract_refs: list[str] = field(default_factory=list)
    baseline_scores: dict[str, Any] = field(default_factory=dict)
    acceptance_criteria: str | None = None
    operator_constraints: dict[str, Any] = field(default_factory=dict)
    request_source: str = "bead"
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    trace_metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ForgeValidationRequest:
    bead_id: str
    candidate_id: str
    repo_id: str
    scan_id: str
    target_path: str
    staged_path: str
    contract_refs: list[str] = field(default_factory=list)
    acceptance_criteria: str = ""
    required_validations: list[str] = field(default_factory=list)
    baseline_scores: dict[str, Any] = field(default_factory=dict)
    generated_tests: list[GeneratedTestArtifact] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["generated_tests"] = [artifact.to_dict() for artifact in self.generated_tests]
        return payload


@dataclass(slots=True)
class GeneratedTestArtifact:
    path: str
    reason: str
    contract_refs: list[str] = field(default_factory=list)
    template: str = "gauntlet"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ForgeCandidateResult:
    status: str
    candidate_id: str
    bead_id: str
    target_path: str
    staged_path: str
    candidate_patch: str
    candidate_content: str
    summary: str
    generated_tests: list[GeneratedTestArtifact] = field(default_factory=list)
    required_validations: list[str] = field(default_factory=list)
    validation_request: ForgeValidationRequest | None = None
    trace_metadata: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["generated_tests"] = [artifact.to_dict() for artifact in self.generated_tests]
        payload["validation_request"] = (
            self.validation_request.to_dict() if self.validation_request is not None else None
        )
        return payload


def build_forge_request_from_bead(
    project_root: Path | str,
    bead_id: str,
    *,
    operator_constraints: dict[str, Any] | None = None,
    request_source: str = "bead",
    trace_metadata: dict[str, Any] | None = None,
) -> ForgeCandidateRequest:
    ledger = BeadLedger(project_root)
    bead = ledger.get_bead(bead_id)
    if bead is None:
        raise ValueError(f"Unknown bead '{bead_id}'.")
    if not bead.target_path:
        raise ValueError(f"Bead '{bead_id}' does not define a target path.")
    if not ledger.has_executable_contract_refs(bead.contract_refs):
        raise ValueError(
            f"Bead '{bead_id}' cannot enter canonical forge without explicit canonical contract references."
        )
    if not bead.acceptance_criteria:
        raise ValueError(
            f"Bead '{bead_id}' cannot enter canonical forge without acceptance criteria."
        )
    if bead.status not in CANONICAL_FORGE_ELIGIBLE_STATUSES:
        raise ValueError(
            f"Bead '{bead_id}' is not eligible for canonical forge in status '{bead.status}'."
        )

    return ForgeCandidateRequest(
        bead_id=bead.id,
        repo_id=bead.repo_id,
        scan_id=bead.scan_id,
        target_path=bead.target_path,
        rationale=bead.rationale,
        contract_refs=list(bead.contract_refs),
        baseline_scores=dict(bead.baseline_scores),
        acceptance_criteria=bead.acceptance_criteria,
        operator_constraints=dict(operator_constraints or {}),
        request_source=request_source,
        trace_metadata=dict(trace_metadata or {}),
    )


def normalize_freeform_intent_to_forge_request(
    project_root: Path | str,
    intent_string: str,
    *,
    target_path: str | None = None,
    contract_refs: list[str] | None = None,
    operator_constraints: dict[str, Any] | None = None,
) -> ForgeCandidateRequest:
    ledger = BeadLedger(project_root)
    if not ledger.has_executable_contract_refs(contract_refs):
        raise ValueError(
            "Freeform intent cannot enter canonical forge without explicit canonical contract references."
        )
    bead = ledger.upsert_bead(
        target_path=target_path,
        rationale=intent_string.strip(),
        contract_refs=contract_refs,
        acceptance_criteria="Forge a validation-ready candidate from the normalized operator intent.",
        status="OPEN",
    )
    if not bead.target_path:
        raise ValueError("Freeform intent normalization requires a target path.")
    return build_forge_request_from_bead(
        project_root,
        bead.id,
        operator_constraints=operator_constraints,
        request_source="freeform_intent",
        trace_metadata={"normalized_from": "intent"},
    )


def normalize_lore_to_forge_request(
    project_root: Path | str,
    lore_file_path: Path | str,
    *,
    contract_refs: list[str] | None = None,
    operator_constraints: dict[str, Any] | None = None,
) -> ForgeCandidateRequest:
    lore_path = Path(lore_file_path)
    lore_text = lore_path.read_text(encoding="utf-8")
    target_path = extract_target_path_from_lore(lore_text, lore_path)
    rationale = summarize_lore_fragment(lore_text)
    ledger = BeadLedger(project_root)
    if not ledger.has_executable_contract_refs(contract_refs):
        raise ValueError(
            "Lore fragments are not canonical contract input for TALIESIN forge. Create a bead with explicit canonical contract references."
        )
    bead = ledger.upsert_bead(
        target_path=target_path,
        rationale=rationale,
        contract_refs=contract_refs,
        acceptance_criteria="Forge a validation-ready candidate from the lore fragment without regressing the baseline.",
        status="OPEN",
    )
    return build_forge_request_from_bead(
        project_root,
        bead.id,
        operator_constraints=operator_constraints,
        request_source="lore_adapter",
        trace_metadata={
            "normalized_from": "lore",
            "lore_file": str(lore_path),
        },
    )


def extract_candidate_payload(raw_output: str) -> dict[str, Any]:
    try:
        fenced = re.search(r"```json\s*(\{.*?\})\s*```", raw_output, re.DOTALL)
        if fenced:
            return json.loads(fenced.group(1))

        start = raw_output.find("{")
        end = raw_output.rfind("}")
        if start != -1 and end != -1:
            return json.loads(raw_output[start : end + 1])
        return json.loads(raw_output)
    except Exception as exc:  # pragma: no cover - caller re-raises with context
        raise ValueError("Could not extract valid forge candidate JSON.") from exc


def stage_forge_candidate(
    project_root: Path | str,
    request: ForgeCandidateRequest,
    payload: dict[str, Any],
    *,
    required_validations: list[str] | None = None,
) -> ForgeCandidateResult:
    root = Path(project_root)
    staged_dir = root / ".agents" / "forge_staged"
    staged_dir.mkdir(parents=True, exist_ok=True)

    candidate_id = f"candidate:{uuid.uuid4().hex[:12]}"
    target_path = str(payload.get("target_path") or request.target_path)
    candidate_content = str(payload.get("code") or payload.get("candidate_content") or "")
    if not candidate_content:
        raise ValueError("Forge candidate payload did not include candidate code.")

    staged_name = f"{candidate_id.replace(':', '_')}__{Path(target_path).name}"
    staged_path = staged_dir / staged_name
    staged_path.write_text(candidate_content, encoding="utf-8")

    summary = str(payload.get("summary") or payload.get("patch_summary") or request.rationale)
    candidate_patch = str(payload.get("patch") or candidate_content)
    validations = list(payload.get("required_validations") or required_validations or ["crucible", "gungnir_delta", "generated_tests"])
    generated_tests = [
        GeneratedTestArtifact(**artifact)
        for artifact in generate_candidate_tests(target_path, request.contract_refs, request.bead_id)
    ]
    validation_request = ForgeValidationRequest(
        bead_id=request.bead_id,
        candidate_id=candidate_id,
        repo_id=request.repo_id,
        scan_id=request.scan_id,
        target_path=target_path,
        staged_path=str(staged_path),
        contract_refs=list(request.contract_refs),
        acceptance_criteria=request.acceptance_criteria or "",
        required_validations=list(validations),
        baseline_scores=dict(request.baseline_scores),
        generated_tests=list(generated_tests),
    )

    return ForgeCandidateResult(
        status="STAGED",
        candidate_id=candidate_id,
        bead_id=request.bead_id,
        target_path=target_path,
        staged_path=str(staged_path),
        candidate_patch=candidate_patch,
        candidate_content=candidate_content,
        summary=summary,
        generated_tests=generated_tests,
        required_validations=validations,
        validation_request=validation_request,
        trace_metadata={
            "request_source": request.request_source,
            "trace_metadata": dict(request.trace_metadata),
            "baseline_scores": dict(request.baseline_scores),
        },
    )


def extract_target_path_from_lore(lore_text: str, lore_path: Path) -> str:
    match = re.search(r"(?:target[_ ]path|file)[:=]\s*`?([A-Za-z0-9_./\\-]+\.(?:py|ts|tsx|js|jsx|qmd|md|json))`?", lore_text, re.IGNORECASE)
    if match:
        return match.group(1).replace("\\", "/")

    fallback = re.search(r"`([A-Za-z0-9_./\\-]+\.(?:py|ts|tsx|js|jsx|qmd|md|json))`", lore_text)
    if fallback:
        return fallback.group(1).replace("\\", "/")

    return f"src/generated/{lore_path.stem}.py"


def summarize_lore_fragment(lore_text: str) -> str:
    for line in lore_text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("---") and ":" not in stripped[:24]:
            return stripped[:240]
    return lore_text.strip()[:240] or "Taliesin lore fragment"
