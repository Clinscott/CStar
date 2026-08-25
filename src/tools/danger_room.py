#!/usr/bin/env python3
"""Fail-closed tombstone for the retired direct test-generation lane."""


class LegacyMutationLaneDecommissioned(RuntimeError):
    """Raised when a caller attempts an untracked model/write workflow."""


class DangerRoom:
    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def execute(self) -> None:
        raise LegacyMutationLaneDecommissioned(
            "Danger Room is decommissioned; route implementation through CStar Forge."
        )


def main() -> int:
    raise LegacyMutationLaneDecommissioned(
        "Danger Room is decommissioned; route implementation through CStar Forge."
    )


if __name__ == "__main__":
    main()
