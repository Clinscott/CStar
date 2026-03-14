"""
[SPOKE] Muninn Heart
Lore: "The Pulse of the Raven."
Purpose: Lifecycle management, process synchronization, and autonomous loop execution.
"""

import asyncio
import os
import time
import uuid
from pathlib import Path
from typing import Any

from src.core.engine.ravens_stage import (
    RavensCycleResult,
    RavensHallReferenceSet,
    RavensStageResult,
    RavensTargetIdentity,
)
from src.core.metrics import ProjectMetricsEngine
from src.core.sovereign_hud import SovereignHUD
from src.sentinel.coordinator import MissionCoordinator
from src.sentinel.muninn_crucible import MuninnCrucible
from src.sentinel.muninn_memory import MuninnMemory
from src.sentinel.muninn_promotion import MuninnPromotion
from src.sentinel.stability import TheWatcher


class MuninnHeart:
    """
    [Ω] The Pulse of Muninn.
    Orchestrates the Hunt -> Forge -> Crucible cycle with endurance hardening.
    Mandate: One Mind. No 'Too Much Mind'.
    """

    def __init__(self, root: Path, uplink: Any):
        self.root = root
        self.uplink = uplink
        self.metrics_engine = ProjectMetricsEngine()
        self.watcher = TheWatcher(self.root)
        self.memory = MuninnMemory(self.root)
        self.coordinator = MissionCoordinator(self.root)
        self.crucible = MuninnCrucible(self.root, self.uplink)
        self.promotion = MuninnPromotion(self.root, self.watcher)

        # Endurance Metrics
        self.start_time = time.time()
        self.cycle_count = 0
        self.total_errors = 0

    def _wait_for_silence(self):
        """Wait for 5 minutes of repository silence before taking flight."""
        if os.getenv("MUNINN_FORCE_FLIGHT") == "true":
            SovereignHUD.persona_log("INFO", "Silence Protocol bypassed by Master's Decree.")
            return

        last_edit = self.watcher.get_last_edit_time()
        while time.time() - last_edit < 300:
            SovereignHUD.persona_log("INFO", "Muninn is observing the matrix, waiting for silence...")
            time.sleep(60)
            last_edit = self.watcher.get_last_edit_time()

    def _repo_id(self) -> str:
        return self.memory.repo_id()

    def _record_stage_observation(
        self,
        repo_id: str,
        stage: str,
        outcome: str,
        observation: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        return self.memory.record_stage_observation(stage, outcome, observation, metadata)

    @staticmethod
    def _target_identity(target: dict[str, Any]) -> RavensTargetIdentity:
        return RavensTargetIdentity(
            target_kind="FILE",
            target_path=target.get("file"),
            bead_id=target.get("bead_id"),
            rationale=target.get("action"),
            acceptance_criteria=target.get("acceptance_criteria"),
            baseline_scores=dict(target.get("metrics") or {}),
            compatibility_source="legacy:mission-coordinator",
        )

    async def _execute_memory_stage(self, repo_id: str) -> RavensStageResult:
        try:
            await self._run_behavioral_pulse()
            summary = "Muninn behavioral pulse completed."
            observation_id = self._record_stage_observation(
                repo_id,
                "memory",
                "SUCCESS",
                summary,
                {"cycle_count": self.cycle_count},
            )
            return RavensStageResult(
                stage="memory",
                status="SUCCESS",
                summary=summary,
                hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=observation_id),
                metadata={"cycle_count": self.cycle_count},
            )
        except Exception as error:
            self.total_errors += 1
            summary = f"Muninn memory stage failed: {error}"
            observation_id = self._record_stage_observation(repo_id, "memory", "FAILURE", summary)
            return RavensStageResult(
                stage="memory",
                status="FAILURE",
                summary=summary,
                hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=observation_id),
                metadata={"error": str(error)},
            )

    def _execute_hunt_stage(self, repo_id: str) -> tuple[RavensStageResult, dict[str, Any] | None]:
        target = self.coordinator.select_mission([], allow_legacy_fallback=False, claim_agent="MUNINN")
        if not target:
            summary = "The Matrix is stabilized. No missions found."
            observation_id = self._record_stage_observation(repo_id, "hunt", "NO_ACTION", summary)
            return (
                RavensStageResult(
                    stage="hunt",
                    status="NO_ACTION",
                    summary=summary,
                    hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=observation_id),
                ),
                None,
            )

        target_identity = self._target_identity(target)
        target_path = target_identity.target_path or ""
        if target_path and self.watcher.is_locked(target_path):
            summary = f"Skipping locked sector: {target_path}"
            observation_id = self._record_stage_observation(
                repo_id,
                "hunt",
                "SKIPPED",
                summary,
                {"target_path": target_path},
            )
            return (
                RavensStageResult(
                    stage="hunt",
                    status="SKIPPED",
                    summary=summary,
                    target=target_identity,
                    hall=RavensHallReferenceSet(
                        repo_id=repo_id,
                        observation_id=observation_id,
                        bead_id=target_identity.bead_id,
                    ),
                ),
                None,
            )

        summary = f"Mission Selected: {target_path or 'unknown target'}"
        observation_id = self._record_stage_observation(
            repo_id,
            "hunt",
            "SUCCESS",
            summary,
            {"target_path": target_path, "mission_id": target.get("mission_id")},
        )
        return (
            RavensStageResult(
                stage="hunt",
                status="SUCCESS",
                summary=summary,
                target=target_identity,
                hall=RavensHallReferenceSet(
                    repo_id=repo_id,
                    observation_id=observation_id,
                    bead_id=target_identity.bead_id,
                ),
                metadata={"mission_id": target.get("mission_id")},
            ),
            target,
        )

    async def execute_cycle(self) -> bool:
        """Compatibility wrapper over the structured Phase 3 cycle contract."""
        cycle = await self.execute_cycle_contract()
        return cycle.status == "SUCCESS"

    async def execute_cycle_contract(self) -> RavensCycleResult:
        """Executes one Muninn cycle and returns the frozen Phase 3 stage contract."""
        self.cycle_count += 1
        repo_id = self._repo_id()
        cycle_mission_id = f"ravens-cycle:{uuid.uuid4().hex[:12]}"
        stages: list[RavensStageResult] = []
        cycle_target: RavensTargetIdentity | None = None

        try:
            memory_stage = await self._execute_memory_stage(repo_id)
            stages.append(memory_stage)
            if memory_stage.status == "FAILURE":
                summary = memory_stage.summary
                cycle_observation_id = self._record_stage_observation(repo_id, "cycle", "FAILURE", summary)
                return RavensCycleResult(
                    status="FAILURE",
                    summary=summary,
                    mission_id=cycle_mission_id,
                    target=cycle_target,
                    stages=stages,
                    hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=cycle_observation_id),
                    metadata={"cycle_count": self.cycle_count, "total_errors": self.total_errors},
                )

            runtime = time.time() - self.start_time
            if runtime > 21600:
                summary = "6-Hour Endurance Limit Reached. Returning to Asgard."
                SovereignHUD.persona_log("INFO", summary)
                cycle_observation_id = self._record_stage_observation(repo_id, "cycle", "NO_ACTION", summary)
                return RavensCycleResult(
                    status="NO_ACTION",
                    summary=summary,
                    mission_id=cycle_mission_id,
                    target=cycle_target,
                    stages=stages,
                    hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=cycle_observation_id),
                    metadata={"cycle_count": self.cycle_count, "total_errors": self.total_errors},
                )

            self._wait_for_silence()
            SovereignHUD.persona_log("INFO", "Muninn consulting the One Mind for target allocation...")
            SovereignHUD.persona_log("ALFRED", "'Too much mind, Master. We must trust the Well.'")

            hunt_stage, target = self._execute_hunt_stage(repo_id)
            stages.append(hunt_stage)
            cycle_target = hunt_stage.target
            if target is None:
                cycle_status = "FAILURE" if hunt_stage.status == "FAILURE" else hunt_stage.status
                cycle_observation_id = self._record_stage_observation(repo_id, "cycle", cycle_status, hunt_stage.summary)
                return RavensCycleResult(
                    status=cycle_status,
                    summary=hunt_stage.summary,
                    mission_id=cycle_mission_id,
                    target=cycle_target,
                    stages=stages,
                    hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=cycle_observation_id),
                    metadata={"cycle_count": self.cycle_count, "total_errors": self.total_errors},
                )

            validation_stage = await self.crucible.execute_validation_stage(
                repo_id,
                target,
                self.memory.record_stage_observation,
            )
            stages.append(validation_stage)
            cycle_target = validation_stage.target or cycle_target
            promotion_stage = self.promotion.execute_promotion_stage(
                repo_id,
                validation_stage,
                self.memory.record_stage_observation,
                self.memory.record_trace,
            )
            stages.append(promotion_stage)
            if promotion_stage.status == "FAILURE":
                self.total_errors += 1
            cycle_status = "SUCCESS" if promotion_stage.status == "SUCCESS" else "FAILURE"
            cycle_summary = promotion_stage.summary
            cycle_observation_id = self._record_stage_observation(repo_id, "cycle", cycle_status, cycle_summary)
            return RavensCycleResult(
                status=cycle_status,
                summary=cycle_summary,
                mission_id=cycle_mission_id,
                target=promotion_stage.target or cycle_target,
                stages=stages,
                hall=RavensHallReferenceSet(
                    repo_id=repo_id,
                    observation_id=cycle_observation_id,
                    validation_id=promotion_stage.hall.validation_id if promotion_stage.hall else None,
                    bead_id=promotion_stage.hall.bead_id if promotion_stage.hall else None,
                ),
                metadata={"cycle_count": self.cycle_count, "total_errors": self.total_errors},
            )

        except Exception as error:
            self.total_errors += 1
            SovereignHUD.persona_log("ERROR", f"Heart failure: {error}")
            summary = f"Heart failure: {error}"
            cycle_observation_id = self._record_stage_observation(
                repo_id,
                "cycle",
                "FAILURE",
                summary,
                {"error": str(error)},
            )
            return RavensCycleResult(
                status="FAILURE",
                summary=summary,
                mission_id=cycle_mission_id,
                target=cycle_target,
                stages=stages,
                hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=cycle_observation_id),
                metadata={"cycle_count": self.cycle_count, "total_errors": self.total_errors, "error": str(error)},
            )
    async def _run_behavioral_pulse(self):
        """[Ω] Trigger a background intent integrity check."""
        import json
        import sys

        fishtest_path = self.root / "sterileAgent" / "fishtest.py"
        if not fishtest_path.exists():
            return

        SovereignHUD.persona_log("INFO", "Muninn initiating Behavioral Pulse (Fishtest V2)...")
        try:
            cmd = [sys.executable, str(fishtest_path), "--file", "fishtest_N100.json"]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
                cwd=str(self.root),
            )
            await process.wait()
            self.memory.sync_intent_integrity_from_sprt()
        except Exception as error:
            SovereignHUD.persona_log("ERROR", f"Fishtest pulse failed: {error}")
