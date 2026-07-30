#!/usr/bin/env python3
"""Retired autonomous multi-warden scout and queue writer."""

RETIRED_ERROR = "legacy_scout_targets_retired_use_cstar_warden_on_demand"


def scout() -> None:
    """Fail closed without scanning source or writing a breach queue."""
    raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
