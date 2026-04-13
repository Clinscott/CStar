"""
[RAVENS] Muninn Heart (Core Logic)
Lore: "The Pulse of the Ravens."
Purpose: Lifecycle management, process synchronization, and autonomous loop execution for the Ravens Protocol.
[Ω] Refactored from src/sentinel/muninn_heart.py for Skill-based architecture.
"""

import asyncio
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from src.core.sovereign_hud import SovereignHUD
from src.core.engine.ravens.muninn_crucible import MuninnCrucible
from src.core.engine.ravens.muninn_memory import MuninnMemory
from src.core.engine.ravens.muninn_promotion import MuninnPromotion
from src.core.engine.ravens.stability import TheWatcher
from src.core.engine.ravens.coordinator import MissionCoordinator

# Re-aliasing for consistency with old code if necessary, though direct import is preferred.
# This should be reviewed to ensure it aligns with the new skill structure.
try:
    from src.core.engine.ravens.ravens_cycle import RavensCycleResult, RavensHallReferenceSet, RavensStageResult, RavensTargetIdentity
except ImportError:
    # Fallback for older structures, likely to be removed
    from src.core.engine.ravens_stage import RavensCycleResult, RavensHallReferenceSet, RavensStageResult, RavensTargetIdentity  # type: ignore


class MuninnHeart:
    """
    [Ω] The Pulse of the Ravens.
    Orchestrates the Hunt -> Forge -> Empire cycle with endurance hardening.
    Mandate: One Mind. No 'Too Much Mind'.
    """
    def __init__(self, root: Path, uplink: Any):
        self.root = root
        self.uplink = uplink
        
        # Legacy components are now managed spokes or abstracted.
        # This ensures clean separation of concerns.
        self.coordinator = MissionCoordinator(self.root)
        self.memory = MuninnMemory(self.root)
        self.promotion = MuninnPromotion(self.root)
        self.crucible = MuninnCrucible(self.root, self.uplink)
        self.watcher = TheWatcher(self.root)
        
        self.start_time = time.time()
        self.cycle_count = 0
        self.total_errors = 0

    async def _run_behavioral_pulse(self) -> bool:
        """Compatibility pulse wrapper over the structured cycle contract."""
        cycle = await self.execute_cycle_contract()
        return cycle.status == "SUCCESS"

    @property
    def agent_id(self) -> str:
        return "MUNINN"

    def _repo_id(self) -> str:
        return self.memory.repo_id()

    def _target_from_mission(self, mission: dict[str, Any]) -> RavensTargetIdentity:
        return RavensTargetIdentity(
            target_kind=mission.get("target_kind", "FILE"),
            target_ref=mission.get("target_ref"),
            target_path=mission.get("file") or mission.get("target_path"),
            bead_id=mission.get("bead_id"),
            rationale=mission.get("action"),
            acceptance_criteria=mission.get("acceptance_criteria"),
            baseline_scores=dict(mission.get("metrics") or {}),
            compatibility_source=mission.get("compatibility_source", "legacy:mission-coordinator"),
        )

    def _memory_stage(self) -> RavensStageResult:
        accuracy = self.memory.sync_intent_integrity_from_sprt()
        if accuracy is None:
            return RavensStageResult(
                stage="memory",
                status="NO_ACTION",
                summary="No SPRT ledger update was available for memory sync.",
                hall=RavensHallReferenceSet(repo_id=self._repo_id()),
                metadata={"intent_integrity": None},
            )
        return RavensStageResult(
            stage="memory",
            status="SUCCESS",
            summary=f"Intent integrity synced to {accuracy:.2f}.",
            hall=RavensHallReferenceSet(repo_id=self._repo_id()),
            metadata={"intent_integrity": accuracy},
        )

    def _hunt_stage(self) -> RavensStageResult:
        mission = self.coordinator.select_mission(
            [],
            allow_legacy_fallback=True,
            claim_agent=self.agent_id,
        )
        if mission is None:
            observation_id = self.memory.record_stage_observation(
                "hunt",
                "NO_ACTION",
                "No mission was available for Muninn.",
                {"claim_agent": self.agent_id},
            )
            return RavensStageResult(
                stage="hunt",
                status="NO_ACTION",
                summary="No mission was available for Muninn.",
                hall=RavensHallReferenceSet(repo_id=self._repo_id(), observation_id=observation_id),
                metadata={"claim_agent": self.agent_id},
            )

        target = self._target_from_mission(mission)
        observation_id = self.memory.record_stage_observation(
            "hunt",
            "SUCCESS",
            f"Mission selected: {target.target_path or target.target_ref or 'unscoped'}.",
            {
                "mission_id": mission.get("mission_id"),
                "bead_id": target.bead_id,
                "target_path": target.target_path,
                "target_ref": target.target_ref,
                "compatibility_source": target.compatibility_source,
            },
        )
        return RavensStageResult(
            stage="hunt",
            status="SUCCESS",
            summary=f"Mission selected: {target.target_path or target.target_ref or 'unscoped'}.",
            target=target,
            hall=RavensHallReferenceSet(
                repo_id=self._repo_id(),
                observation_id=observation_id,
                bead_id=target.bead_id,
                scan_id=mission.get("scan_id"),
            ),
            metadata=dict(mission),
        )

    async def execute_cycle_contract(self) -> RavensCycleResult:
        self.cycle_count += 1
        cycle_start = time.time()
        repo_id = self._repo_id()

        if os.getenv("MUNINN_FORCE_FLIGHT") != "true" and (cycle_start - self.start_time) > 21600:
            summary = "Endurance limit reached. Returning to the High Seat."
            SovereignHUD.persona_log("INFO", summary)
            return RavensCycleResult(
                status="NO_ACTION",
                summary=summary,
                mission_id="mission:muninn:endurance-limit",
                hall=RavensHallReferenceSet(repo_id=repo_id),
                metadata={"cycle_count": self.cycle_count, "total_errors": self.total_errors},
            )

        self._wait_for_silence()
        SovereignHUD.persona_log("INFO", "Ravens taking flight...")

        stages: list[RavensStageResult] = []
        mission_id = f"mission:muninn:cycle:{self.cycle_count}"
        target: RavensTargetIdentity | None = None

        try:
            memory_stage = self._memory_stage()
            stages.append(memory_stage)

            hunt_stage = self._hunt_stage()
            stages.append(hunt_stage)
            if hunt_stage.status != "SUCCESS" or hunt_stage.target is None:
                return RavensCycleResult(
                    status="NO_ACTION",
                    summary=hunt_stage.summary,
                    mission_id=mission_id,
                    stages=stages,
                    hall=RavensHallReferenceSet(
                        repo_id=repo_id,
                        observation_id=hunt_stage.hall.observation_id if hunt_stage.hall else None,
                    ),
                    metadata={"cycle_count": self.cycle_count, "total_errors": self.total_errors},
                )

            mission_payload = dict(hunt_stage.metadata)
            mission_id = str(mission_payload.get("mission_id") or mission_id)
            target = hunt_stage.target

            validate_stage = await self.crucible.execute_validation_stage(
                repo_id,
                mission_payload,
                self.memory.record_stage_observation,
            )
            stages.append(validate_stage)

            promote_stage = self.promotion.execute_promotion_stage(
                repo_id,
                validate_stage,
                self.memory.record_stage_observation,
                self.memory.record_trace,
            )
            stages.append(promote_stage)

            final_status = "SUCCESS" if promote_stage.status == "SUCCESS" else "FAILURE"
            return RavensCycleResult(
                status=final_status,
                summary=promote_stage.summary,
                mission_id=mission_id,
                target=target,
                stages=stages,
                hall=promote_stage.hall or validate_stage.hall or hunt_stage.hall,
                metadata={
                    "cycle_count": self.cycle_count,
                    "total_errors": self.total_errors,
                    "elapsed_seconds": round(time.time() - cycle_start, 4),
                },
            )
        except Exception as e:
            self.total_errors += 1
            summary = f"Ravens cycle failed: {e}"
            SovereignHUD.persona_log("ERROR", summary)
            observation_id = self.memory.record_stage_observation(
                "memory",
                "FAILURE",
                summary,
                {"cycle_count": self.cycle_count},
            )
            return RavensCycleResult(
                status="FAILURE",
                summary=summary,
                mission_id=mission_id,
                target=target,
                stages=stages,
                hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=observation_id),
                metadata={"cycle_count": self.cycle_count, "total_errors": self.total_errors},
            )
        finally:
            self.memory.log_cycle_completion(self.cycle_count, self.total_errors)
            SovereignHUD.persona_log("INFO", f"Cycle {self.cycle_count} completed with {self.total_errors} errors.")

    async def execute_cycle(self) -> bool:
        """
        Executes one autonomous repair cycle.
        This is the primary loop for the Ravens Protocol.
        """
        cycle = await self.execute_cycle_contract()
        return cycle.status == "SUCCESS"

    def _wait_for_silence(self):
        """Waits for repository silence before taking flight."""
        if os.getenv("MUNINN_FORCE_FLIGHT") == "true":
            return

        interval = float(os.getenv("MUNINN_SILENCE_INTERVAL", "1"))
        max_attempts = int(os.getenv("MUNINN_SILENCE_ATTEMPTS", "3"))
        previous = self._repository_activity_snapshot()
        for _ in range(max_attempts):
            time.sleep(interval)
            current = self._repository_activity_snapshot()
            if current == previous:
                return
            previous = current

        raise RuntimeError("Repository activity did not settle before Ravens flight.")

    def _repository_activity_snapshot(self) -> str:
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=self.root,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return f"git-status-unavailable:{type(exc).__name__}"
        return result.stdout
