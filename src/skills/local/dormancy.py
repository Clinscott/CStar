"""Retired legacy dormancy workflow.

The historical implementation performed autonomous repair, direct bead/memory
writes, and persona-file reads. CStar lifecycle tools now own those operations.
"""

from __future__ import annotations


RETIREMENT_MESSAGE = (
    "Legacy dormancy automation is retired. Use the CStar lifecycle/status "
    "surface for an explicit, operator-authorized state transition."
)


def main() -> None:
    """Fail closed instead of running the retired autonomous workflow."""
    raise SystemExit(RETIREMENT_MESSAGE)


if __name__ == "__main__":
    main()
