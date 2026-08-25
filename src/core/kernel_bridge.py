"""Import-safe tombstone for the retired Python kernel bridge.

The supported control-plane transport is the TypeScript ``cstar-kernel`` MCP
server over direct stdio.  This compatibility module deliberately exposes no
filesystem, provider, validation, or lifecycle actions.
"""

from __future__ import annotations

import json
import sys
from typing import Any


MARKER = "__CORVUS_KERNEL__"
RETIRED_KERNEL_BRIDGE_ERROR = (
    "legacy_python_kernel_bridge_retired_use_cstar_kernel_mcp"
)


def _retired_result() -> dict[str, Any]:
    return {
        "status": "error",
        "error": RETIRED_KERNEL_BRIDGE_ERROR,
        "data": {
            "execution_dispatched": False,
            "hall_mutation_started": False,
            "provider_attempted": False,
            "process_started": False,
            "source_access_started": False,
        },
    }


async def _dispatch(payload: dict[str, Any]) -> dict[str, Any]:
    """Reject every legacy command without inspecting caller-controlled data."""

    del payload
    return _retired_result()


def main() -> int:
    sys.stdout.write(f"{MARKER}{json.dumps(_retired_result(), sort_keys=True)}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
