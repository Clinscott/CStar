#!/usr/bin/env python3
"""Fail-closed compatibility boundary for the retired Sovereign Worker.

The former worker combined an untracked local model loop with shell and file
mutation. Corvus implementation must instead use the recorded CStar Forge
lifecycle and independent validation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


DECOMMISSIONED_CODE = "CSTAR_SOVEREIGN_WORKER_DECOMMISSIONED"


class LegacyExecutionLaneDecommissioned(RuntimeError):
    """Raised before any model, process, filesystem, or lifecycle action."""


def _rejection() -> LegacyExecutionLaneDecommissioned:
    return LegacyExecutionLaneDecommissioned(
        f"{DECOMMISSIONED_CODE}: route implementation through cstar_forge_request "
        "and cstar_forge_execute"
    )


class CStarBridge:
    """Import-compatible bridge that deliberately exposes no execution tools."""

    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)

    def execute_tool(self, name: str, args: Mapping[str, Any]) -> str:
        del name, args
        raise _rejection()


@dataclass
class SovereignWorker:
    """Import-compatible worker that rejects before model invocation."""

    project_root: Path
    model: str | None = None
    base_url: str | None = None
    max_turns: int = 0

    def __post_init__(self) -> None:
        self.project_root = Path(self.project_root)
        self.bridge = CStarBridge(self.project_root)
        self.messages: list[dict[str, str]] = []

    def run(self, system_prompt: str, user_prompt: str) -> str:
        del system_prompt, user_prompt
        raise _rejection()

    def _call_llm(self) -> str:
        raise _rejection()

    def _parse_tool_calls(self, text: str) -> list[tuple[str, dict[str, Any]]]:
        del text
        raise _rejection()


def main() -> int:
    print(
        json.dumps(
            {
                "ok": False,
                "code": DECOMMISSIONED_CODE,
                "canonical_route": [
                    "cstar_forge_request",
                    "cstar_forge_execute",
                    "cstar_record_result",
                ],
            },
            sort_keys=True,
        )
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
