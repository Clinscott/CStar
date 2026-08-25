"""Fail-closed compatibility tombstone for the legacy Python CognitiveRouter.

The former router translated intent through Mimir, acquired locks, returned a
synthetic Forge success, and wrote unverified lessons. Current routing uses
typed kernel/host surfaces; implementation uses the durable Forge lifecycle.
"""

from __future__ import annotations

import uuid
from pathlib import Path


DECOMMISSIONED_ERROR = (
    "python_cognitive_router_permanently_decommissioned: use cstar_intent_route "
    "for advisory routing and cstar_forge_request -> cstar_forge_execute for implementation"
)


class CognitiveRouter:
    """Compatibility object that performs no inference, mutation, or learning."""

    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root
        self.agent_id = f"RETIRED-{uuid.uuid4().hex[:8]}"

    async def route_intent(
        self,
        prompt: str,
        target_file: str = "",
        loki_mode: bool = False,
    ) -> dict[str, object]:
        del prompt, target_file, loki_mode
        return {
            "status": "error",
            "error_code": "cognitive_router_decommissioned",
            "message": DECOMMISSIONED_ERROR,
            "execution_attempted": False,
            "learning_write_attempted": False,
        }

    async def _execute_forge(
        self,
        goal: str,
        targets: list[object],
        tools: list[object],
        workflows: list[object],
    ) -> dict[str, object]:
        del goal, targets, tools, workflows
        return {
            "status": "error",
            "error_code": "forge_lifecycle_required",
            "message": DECOMMISSIONED_ERROR,
            "execution_attempted": False,
        }

    async def _run_learning_session(
        self,
        goal: str,
        targets: list[object],
        status: str,
        context: str,
    ) -> None:
        del goal, targets, status, context

    async def _dispatch_wild_hunt(
        self,
        missing_capabilities: list[object],
        goal: str,
    ) -> dict[str, object]:
        del goal
        return {
            "status": "error",
            "error_code": "skill_acquisition_decommissioned",
            "missing_capabilities": sorted({str(capability) for capability in missing_capabilities}),
            "message": "Direct skill acquisition is decommissioned.",
        }
