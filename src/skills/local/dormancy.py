#!/usr/bin/env python3
"""Retired compatibility surface for the former autonomous dormancy cycle.

Sleep is now a deterministic runtime-state transition. Session evidence,
handoff writing, and operator-gated Git actions belong to the cstar-closeout
skill; autonomous repair, model calls, bead creation, and memory writes are not
permitted from a sleep hook.
"""

from __future__ import annotations

import json


DECOMMISSIONED_CODE = "CSTAR_DORMANCY_AUTOMATION_DECOMMISSIONED"


class DormancyAutomationDecommissioned(RuntimeError):
    """Raised when a caller tries to invoke the retired dream cycle."""


async def consolidated_memory() -> None:
    raise DormancyAutomationDecommissioned(
        f"{DECOMMISSIONED_CODE}: use the explicit cstar-closeout skill"
    )


def main() -> int:
    print(
        json.dumps(
            {
                "ok": False,
                "code": DECOMMISSIONED_CODE,
                "message": "Dormancy no longer repairs, delegates, writes memory, or creates beads.",
                "successor": "cstar-closeout",
            },
            sort_keys=True,
        )
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
