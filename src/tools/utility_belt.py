#!/usr/bin/env python3
"""Fail-closed tombstone for the retired direct refactoring lane."""

from src.tools.danger_room import LegacyMutationLaneDecommissioned


class UtilityBelt:
    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def execute(self) -> None:
        raise LegacyMutationLaneDecommissioned(
            "Utility Belt is decommissioned; route implementation through CStar Forge."
        )


def main() -> int:
    raise LegacyMutationLaneDecommissioned(
        "Utility Belt is decommissioned; route implementation through CStar Forge."
    )


if __name__ == "__main__":
    main()
