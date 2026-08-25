"""Read-only one-shot compatibility bridge for the legacy CortexLink.

Mutation, autonomous polling, model routing, verification, and rollback moved
to typed CStar/kernel lifecycles. This bridge now exposes health/no-op
compatibility only and fails closed for every other command.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MARKER = "__CORVUS_KERNEL__"
SAFE_COMMANDS = {"ping", "shutdown", "MATRIX_UPDATED", "HEIMDALL_ALERT"}


def _success(data: Any | None = None, **extra: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": "success", "data": data}
    payload.update(extra)
    return payload


def _error(message: str, *, data: Any | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": "error", "error": message}
    if data is not None:
        payload["data"] = data
    return payload


async def _dispatch(payload: dict[str, Any]) -> dict[str, Any]:
    command = str(payload.get("command") or "").strip()
    if command == "ping":
        return _success({
            "message": "kernel bridge ready (read-only compatibility)",
            "root": str(PROJECT_ROOT),
            "mutation_capable": False,
        })
    if command == "shutdown":
        return _success({"message": "No resident daemon is running in kernel mode."})
    if command in {"MATRIX_UPDATED", "HEIMDALL_ALERT"}:
        return _success({
            "status": "NOOP",
            "message": "Legacy bridge notification accepted as a read-only no-op.",
        })
    return _error(
        f"kernel_bridge_command_decommissioned:{command or 'missing'}; "
        "use a bounded cstar-kernel lifecycle tool"
    )


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        result = asyncio.run(_dispatch(payload))
    except Exception as error:
        result = _error(str(error))
    print(f"{MARKER}{json.dumps(result, ensure_ascii=True)}")


if __name__ == "__main__":
    main()
