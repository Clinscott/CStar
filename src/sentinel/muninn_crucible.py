"""
[SPOKE] Muninn Crucible
Lore: "The Anvil of Odin."
Purpose: Forging reproduction tests, generating fixes, and verifying candidates in the Crucible.
"""

import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from src.core.engine.forge_candidate import ForgeValidationRequest, GeneratedTestArtifact
from src.core.engine.ravens_stage import RavensHallReferenceSet, RavensStageResult, RavensTargetIdentity
from src.core.engine.validation_result import (
    ValidationCheck,
    ValidationResult,
    create_benchmark_result,
    create_validation_result,
    save_validation_result,
)
from src.core.sovereign_hud import SovereignHUD
from src.sentinel.code_sanitizer import BifrostGate


@dataclass(slots=True)
class PreparedCandidate:
    target: RavensTargetIdentity
    file_path: Path
    test_path: Path
    fix_content: str
    candidate_source: str
    staged_candidate_path: Path | None = None


class MuninnCrucible:
    def __init__(self, root: Path, uplink: Any):
        self.root = root
        self.uplink = uplink
        self.gate = BifrostGate(root)

    @staticmethod
    def _target_identity(target: dict[str, Any]) -> RavensTargetIdentity:
        return RavensTargetIdentity(
            target_kind=target.get("target_kind", "FILE"),
            target_path=target.get("file"),
            bead_id=target.get("bead_id"),
            rationale=target.get("action"),
            acceptance_criteria=target.get("acceptance_criteria"),
            baseline_scores=dict(target.get("metrics") or {}),
            compatibility_source=target.get("compatibility_source", "legacy:mission-coordinator"),
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
            "action": handoff.acceptance_criteria or f"Validate forge candidate {handoff.candidate_id}",
            "acceptance_criteria": handoff.acceptance_criteria,
            "contract_refs": list(handoff.contract_refs),
            "metrics": dict(handoff.baseline_scores),
            "compatibility_source": "forge:validation_request",
            "required_validations": list(handoff.required_validations),
            "generated_tests": [artifact.to_dict() for artifact in handoff.generated_tests],
            "staged_candidate_path": handoff.staged_path,
            "validation_request": handoff.to_dict(),
        }

    @classmethod
    def _normalize_validation_target(cls, target: dict[str, Any]) -> dict[str, Any]:
        validation_request = target.get("validation_request")
        if validation_request is None:
            return dict(target)

        normalized = cls.build_validation_target_from_request(
            validation_request,
            mission_id=target.get("mission_id"),
        )
        for key, value in target.items():
            if key == "validation_request" or value is None:
                continue
            normalized[key] = value
        return normalized

    def _resolve_generated_test_path(self, target: dict[str, Any]) -> Path | None:
        for artifact in target.get("generated_tests") or []:
            candidate_path = artifact.get("path") if isinstance(artifact, dict) else None
            if not candidate_path:
                continue
            resolved = Path(candidate_path)
            if not resolved.is_absolute():
                resolved = self.root / resolved
            if resolved.exists():
                return resolved
        return None

    async def generate_gauntlet(self, target: dict, code: str) -> Path | None:
        """Creates a pytest reproduction for the identified breach."""
        justification = target.get("action") or target.get("justification") or "Improve code quality"
        prompt = (
            f"Generate a pytest reproduction test for the following issue in {target['file']}: {justification}.\n"
            f"DO NOT USE ANY TOOLS. DO NOT CALL ANY FUNCTIONS OTHER THAN THE CODE PROVIDED.\n"
            f"Respond ONLY with a JSON object containing the 'code' key with the python test content.\n"
            f"The test MUST fail on the current code and pass once the issue is fixed.\n"
            f"Code:\n{code}"
        )
        SovereignHUD.persona_log("INFO", "Contacting the High Seat for Gauntlet blueprints...")
        
        res = await self.uplink.send_payload(prompt, {"persona": "ALFRED"})
        if res.get("status") != "success":
            return None
        
        raw_code = res["data"].get("code") or res["data"].get("raw", "")
        clean_test = self.gate.sanitize_test(raw_code, target["file"])
        
        test_file = self.root / "tests" / "gauntlet" / f"test_{int(time.time())}.py"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text(clean_test, encoding="utf-8")
        
        SovereignHUD.persona_log("SUCCESS", f"Gauntlet forged at {test_file.name}")
        return test_file

    async def generate_steel(self, target: dict, code: str, test_path: Path) -> str | None:
        """Generates the code fix (Steel) based on the gauntlet failure."""
        test_code = test_path.read_text(encoding="utf-8")
        justification = target.get("action") or target.get("justification") or "Improve code quality"
        prompt = (
            f"Fix the following issue: {justification}. File: {target['file']}.\n"
            f"DO NOT USE ANY TOOLS. Respond ONLY with a JSON object containing the 'code' key with the fixed python code.\n"
            f"Code:\n{code}\nReproduction Test:\n{test_code}"
        )
        
        SovereignHUD.persona_log("INFO", "Consulting Mimir for the Steel formula...")
        res = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
        if res.get("status") != "success":
            return None
            
        raw_code = res["data"].get("code") or res["data"].get("raw", "")
        SovereignHUD.persona_log("SUCCESS", "Steel formula received.")
        return self.gate.sanitize_code(raw_code)

    async def prepare_candidate(self, target: dict[str, Any]) -> tuple[PreparedCandidate | None, str | None]:
        """Transitional forge adapter that prepares candidate artifacts ahead of validation."""
        target = self._normalize_validation_target(target)
        target_identity = self._target_identity(target)
        target_path = target_identity.target_path or ""
        file_path = self.root / target_path
        if not file_path.exists():
            return None, f"Target path does not exist: {target_path}"

        code = file_path.read_text(encoding="utf-8")
        test_path = self._resolve_generated_test_path(target)
        if test_path is None:
            test_path = await self.generate_gauntlet(target, code)
        if not test_path:
            return None, f"Gauntlet generation failed for {target_path}."

        staged_candidate_path: Path | None = None
        candidate_source = "generated_steel"
        if target.get("staged_candidate_path"):
            staged_candidate_path = Path(str(target["staged_candidate_path"]))
            if not staged_candidate_path.is_absolute():
                staged_candidate_path = self.root / staged_candidate_path
            if not staged_candidate_path.exists():
                return None, f"Staged candidate path does not exist: {staged_candidate_path}"
            fix_content = staged_candidate_path.read_text(encoding="utf-8")
            candidate_source = "staged_candidate"
        else:
            fix_content = await self.generate_steel(target, code, test_path)
            if not fix_content:
                return None, f"Steel generation failed for {target_path}."

        return PreparedCandidate(
            target=target_identity,
            file_path=file_path,
            test_path=test_path,
            fix_content=fix_content,
            candidate_source=candidate_source,
            staged_candidate_path=staged_candidate_path,
        ), None

    async def execute_validation_stage(
        self,
        repo_id: str,
        target: dict[str, Any],
        record_observation: Callable[[str, str, str, dict[str, Any] | None], str],
    ) -> RavensStageResult:
        target = self._normalize_validation_target(target)
        prepared, failure_summary = await self.prepare_candidate(target)
        target_identity = self._target_identity(target)
        if prepared is None:
            observation_id = record_observation(
                "validate",
                "FAILURE",
                failure_summary or "Validation candidate preparation failed.",
                {
                    "target_path": target_identity.target_path,
                    "staged_candidate_path": target.get("staged_candidate_path"),
                    "required_validations": list(target.get("required_validations") or []),
                },
            )
            return RavensStageResult(
                stage="validate",
                status="FAILURE",
                summary=failure_summary or "Validation candidate preparation failed.",
                target=target_identity,
                hall=RavensHallReferenceSet(
                    repo_id=repo_id,
                    observation_id=observation_id,
                    bead_id=target_identity.bead_id,
                ),
                metadata={
                    "candidate_applied": False,
                    "staged_candidate_path": target.get("staged_candidate_path"),
                    "generated_tests": list(target.get("generated_tests") or []),
                    "required_validations": list(target.get("required_validations") or []),
                    "contract_refs": list(target.get("contract_refs") or []),
                    "acceptance_criteria": target.get("acceptance_criteria"),
                },
            )

        self.apply_fix(prepared.file_path, prepared.fix_content)
        validation = self.verify_fix_result(
            prepared.test_path,
            metadata={"target_path": prepared.target.target_path, "mission_id": target.get("mission_id")},
        )
        saved_validation = save_validation_result(
            str(self.root),
            validation,
            scan_id=target.get("scan_id"),
            bead_id=prepared.target.bead_id,
            target_path=prepared.target.target_path,
            notes=validation.summary,
        )
        observation_id = record_observation(
            "validate",
            validation.verdict,
            validation.summary,
            {
                "target_path": prepared.target.target_path,
                "test_path": str(prepared.test_path),
                "validation_id": saved_validation.validation_id,
                "candidate_source": prepared.candidate_source,
                "staged_candidate_path": (
                    str(prepared.staged_candidate_path) if prepared.staged_candidate_path is not None else None
                ),
                "required_validations": list(target.get("required_validations") or []),
            },
        )
        status = "SUCCESS" if validation.verdict == "ACCEPTED" else "FAILURE"
        return RavensStageResult(
            stage="validate",
            status=status,
            summary=validation.summary,
            target=prepared.target,
            hall=RavensHallReferenceSet(
                repo_id=repo_id,
                observation_id=observation_id,
                validation_id=saved_validation.validation_id,
                bead_id=prepared.target.bead_id,
            ),
            metadata={
                "candidate_applied": True,
                "mission_id": target.get("mission_id"),
                "scan_id": target.get("scan_id"),
                "validation_verdict": validation.verdict,
                "validation_summary": validation.summary,
                "validation_blocking_reasons": list(validation.blocking_reasons),
                "score_delta": validation.score_delta.to_dict(),
                "benchmark": validation.benchmark.to_dict() if validation.benchmark else None,
                "checks": [check.to_dict() for check in validation.checks],
                "test_path": str(prepared.test_path),
                "candidate_source": prepared.candidate_source,
                "staged_candidate_path": (
                    str(prepared.staged_candidate_path) if prepared.staged_candidate_path is not None else None
                ),
                "generated_tests": list(target.get("generated_tests") or []),
                "required_validations": list(target.get("required_validations") or []),
                "contract_refs": list(target.get("contract_refs") or []),
                "acceptance_criteria": target.get("acceptance_criteria"),
                "validation_request": dict(target.get("validation_request") or {}),
            },
        )

    def verify_fix_result(
        self,
        test_path: Path,
        *,
        before_scores: dict[str, Any] | None = None,
        after_scores: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ValidationResult:
        """Executes the gauntlet tests and returns the canonical validation envelope."""
        SovereignHUD.persona_log("INFO", f"Entering the Crucible for verification: {test_path.name}")
        cmd = [sys.executable, "-m", "pytest", str(test_path), "-v"]
        started = time.perf_counter()

        try:
            # 120s timeout for unit verification to prevent hangs
            result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=120)
            elapsed_ms = (time.perf_counter() - started) * 1000
            benchmark = create_benchmark_result(
                status="PASS" if result.returncode == 0 else "FAIL",
                summary="Crucible verification completed." if result.returncode == 0 else "Crucible verification failed.",
                trials=1,
                avg_latency_ms=elapsed_ms,
                min_latency_ms=elapsed_ms,
                max_latency_ms=elapsed_ms,
                stddev_latency_ms=0.0,
                metadata={"test_path": str(test_path)},
            )
            check = ValidationCheck(
                name="crucible",
                status="PASS" if result.returncode == 0 else "FAIL",
                details=(result.stdout or result.stderr or "").strip()[:500] or None,
            )

            if result.returncode == 0:
                SovereignHUD.persona_log("SUCCESS", "The Crucible is satisfied. Fix verified.")
                return create_validation_result(
                    before=before_scores,
                    after=after_scores or before_scores,
                    benchmark=benchmark,
                    checks=[check],
                    summary="Crucible accepted the candidate.",
                    metadata={"test_path": str(test_path), **(metadata or {})},
                )

            SovereignHUD.persona_log("ERROR", f"Crucible Failure:\n{result.stdout}\n{result.stderr}")
            return create_validation_result(
                before=before_scores,
                after=after_scores or before_scores,
                benchmark=benchmark,
                checks=[check],
                summary="Crucible rejected the candidate.",
                metadata={"test_path": str(test_path), **(metadata or {})},
            )
        except subprocess.TimeoutExpired:
            SovereignHUD.persona_log("ERROR", "Crucible Timeout: Verification stalled.")
            elapsed_ms = (time.perf_counter() - started) * 1000
            benchmark = create_benchmark_result(
                status="FAIL",
                summary="Crucible verification timed out.",
                trials=1,
                avg_latency_ms=elapsed_ms,
                min_latency_ms=elapsed_ms,
                max_latency_ms=elapsed_ms,
                stddev_latency_ms=0.0,
                metadata={"test_path": str(test_path), "timeout_seconds": 120},
            )
            return create_validation_result(
                before=before_scores,
                after=after_scores or before_scores,
                benchmark=benchmark,
                checks=[ValidationCheck(name="crucible", status="FAIL", details="Verification timed out.")],
                summary="Crucible timed out and rejected the candidate.",
                metadata={"test_path": str(test_path), **(metadata or {})},
            )

    def verify_fix(self, test_path: Path) -> bool:
        """Compatibility wrapper for legacy call sites awaiting a boolean verdict."""
        return self.verify_fix_result(test_path).verdict == "ACCEPTED"

    def apply_fix(self, file_path: Path, new_content: str):
        """Applies the forged fix to the target file and creates a backup."""
        if file_path.exists():
            shutil.copy(file_path, str(file_path) + ".bak")
        file_path.write_text(new_content, encoding="utf-8")

    def rollback(self, file_path: Path):
        """Restores the file from backup if verification fails."""
        bak_path = Path(str(file_path) + ".bak")
        if bak_path.exists():
            SovereignHUD.persona_log("INFO", f"Rolling back changes for {file_path.name}...")
            shutil.copy(bak_path, file_path)
            bak_path.unlink()
