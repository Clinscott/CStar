"""Detached Forge request schemas and pure payload parsers.

Direct bead reads, request normalization with persistence, generated-test
execution, and candidate staging are retired in favor of CStar Forge.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)
CANONICAL_FORGE_ELIGIBLE_STATUSES = {"OPEN", "IN_PROGRESS"}


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


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
class GeneratedTestArtifact:
    path: str
    reason: str
    contract_refs: list[str] = field(default_factory=list)
    template: str = "gauntlet"

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
        payload["generated_tests"] = [
            artifact.to_dict() for artifact in self.generated_tests
        ]
        return payload


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
        payload["generated_tests"] = [
            artifact.to_dict() for artifact in self.generated_tests
        ]
        payload["validation_request"] = (
            self.validation_request.to_dict()
            if self.validation_request is not None
            else None
        )
        return payload


def extract_candidate_payload(raw_output: str) -> dict[str, Any]:
    """Parse a detached JSON payload without reading or writing any source."""
    try:
        fenced = re.search(r"```json\s*(\{.*?\})\s*```", raw_output, re.DOTALL)
        if fenced:
            return json.loads(fenced.group(1))
        start = raw_output.find("{")
        end = raw_output.rfind("}")
        if start != -1 and end != -1:
            return json.loads(raw_output[start : end + 1])
        return json.loads(raw_output)
    except Exception as exc:
        raise ValueError("Could not extract valid forge candidate JSON.") from exc


def extract_target_path_from_lore(lore_text: str, lore_path: Path) -> str:
    """Parse a target path from detached lore text."""
    patterns = (
        r"(?im)^target(?:_path)?\s*:\s*`?([^`\n]+)`?\s*$",
        r"(?im)^file\s*:\s*`?([^`\n]+)`?\s*$",
    )
    for pattern in patterns:
        match = re.search(pattern, lore_text)
        if match:
            return match.group(1).strip()
    return str(lore_path.with_suffix(".py"))


def summarize_lore_fragment(lore_text: str) -> str:
    """Return the first non-empty detached lore line."""
    for line in lore_text.splitlines():
        cleaned = line.strip().lstrip("#").strip()
        if cleaned and not cleaned.startswith("---"):
            return cleaned[:240]
    return "Normalize a legacy lore fragment through canonical Forge review."


def build_forge_request_from_bead(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


def normalize_freeform_intent_to_forge_request(
    *_args: object, **_kwargs: object
) -> NoReturn:
    _retired()


def normalize_lore_to_forge_request(
    *_args: object, **_kwargs: object
) -> NoReturn:
    _retired()


def stage_forge_candidate(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()
