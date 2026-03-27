"""
[ENGINE] Adaptive Environment Adapter
Purpose: Probes the host for sub-agent capabilities and orchestrates delegation vs. JIT injection.
"""

import os
import sys
from enum import Enum, auto
from typing import Any


class HostCapability(Enum):
    SUB_AGENTS = auto()      # Host supports tool-based sub-agent spawning
    LOCAL_JIT = auto()       # Monolithic execution with JIT prompt injection
    HEADLESS = auto()        # Minimal execution (CI/CD, scripts)

class EnvAdapter:
    """
    [O.D.I.N.] The All-Seeing Eye.
    Detects the capabilities of the Manor's host environment.
    """
    def __init__(self):
        self.capability = self._detect_capability()

    def _detect_capability(self) -> HostCapability:
        # 1. Check for explicit sub-agent host flags
        if os.environ.get("GEMINI_CLI_SUBAGENTS") == "true":
            return HostCapability.SUB_AGENTS
        if os.environ.get("CODEX_SUBAGENTS") == "true" or os.environ.get("CLAUDE_SUBAGENTS") == "true":
            return HostCapability.SUB_AGENTS

        # 2. Check for provider SDK/tool presence or explicit interactive host mode.
        if (
            "google.gemini" in sys.modules
            or os.environ.get("AGENT_MODE") == "interactive"
            or os.environ.get("CODEX_SHELL") == "1"
            or os.environ.get("CODEX_THREAD_ID")
            or os.environ.get("CORVUS_HOST_PROVIDER") in {"codex", "claude"}
        ):
            return HostCapability.SUB_AGENTS

        # 3. Default to Local JIT for standard terminal runs
        return HostCapability.LOCAL_JIT

    def get_execution_plan(self, domain: str, top_skill: str) -> dict[str, Any]:
        """Returns the optimal path for skill execution."""
        if self.capability == HostCapability.SUB_AGENTS:
            return {
                "action": "DELEGATE",
                "target_agent": f"@{domain.lower()}-agent",
                "skill": top_skill,
                "note": "Host supports sub-agent delegation."
            }
        else:
            return {
                "action": "INJECT",
                "target_agent": "SELF",
                "skill": top_skill,
                "note": "Performing local JIT instruction injection."
            }
