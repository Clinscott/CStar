#!/usr/bin/env python3
"""Import-safe tombstone for the retired local Sovereign worker.

Implementation work belongs to the durable CStar Forge lane.  This module
retains only the deterministic XML parser needed to inspect historical worker
transcripts; every action-bearing entrypoint fails before side effects.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


RETIRED_SOVEREIGN_WORKER_ERROR = (
    "legacy_sovereign_worker_retired_use_cstar_forge"
)


def _retired() -> RuntimeError:
    return RuntimeError(RETIRED_SOVEREIGN_WORKER_ERROR)


class CStarBridge:
    """Compatibility type whose former shell/filesystem bridge is retired."""

    def __init__(self, project_root: Path):
        self.project_root = project_root

    def execute_tool(self, name: str, args: dict[str, Any]) -> str:
        del name, args
        raise _retired()


@dataclass
class SovereignWorker:
    """Historical transcript parser with no worker execution capability."""

    project_root: Path
    model: str = "retired"
    base_url: str = "retired"
    max_turns: int = 0
    bridge: CStarBridge = field(init=False)
    messages: list[dict[str, str]] = field(init=False, default_factory=list)

    def __post_init__(self) -> None:
        self.bridge = CStarBridge(self.project_root)

    def run(self, system_prompt: str, user_prompt: str) -> str:
        del system_prompt, user_prompt
        raise _retired()

    def _call_llm(self) -> str:
        raise _retired()

    def _parse_tool_calls(self, text: str) -> list[tuple[str, dict[str, Any]]]:
        """Parse legacy XML without executing or validating named tools."""

        pattern = r'<invoke\s+name=["\']([^"\']+)["\']\s*>(.*?)</invoke>'
        calls: list[tuple[str, dict[str, Any]]] = []
        for match in re.finditer(pattern, text, re.DOTALL):
            name = match.group(1)
            args_xml = match.group(2)
            args: dict[str, Any] = {}

            names = re.findall(r"<arg_name>(.*?)</arg_name>", args_xml, re.DOTALL)
            values = re.findall(r"<arg_value>(.*?)</arg_value>", args_xml, re.DOTALL)
            for key, value in zip(names, values, strict=False):
                args[key.strip()] = value.strip()

            arg_pattern = r"<([^>]+)>(.*?)</\1>"
            for arg_match in re.finditer(arg_pattern, args_xml, re.DOTALL):
                key = arg_match.group(1).strip()
                value = arg_match.group(2).strip()
                if key not in {"arg_name", "arg_value"} and key not in args:
                    args[key] = value

            if not args and "<arg>" in args_xml:
                arg_value = re.search(r"<arg>(.*?)</arg>", args_xml, re.DOTALL)
                if arg_value:
                    if name in {"read_file", "list_directory"}:
                        args["path"] = arg_value.group(1).strip()
                    elif name == "run_shell_command":
                        args["command"] = arg_value.group(1).strip()

            calls.append((name, args))
        return calls


def main() -> int:
    sys.stderr.write(f"{RETIRED_SOVEREIGN_WORKER_ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
