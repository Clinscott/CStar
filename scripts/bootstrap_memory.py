#!/usr/bin/env python3
"""Retired noncanonical semantic-memory bootstrap script."""

RETIRED_ERROR = "legacy_memory_bootstrap_retired_use_cstar_kernel_memory_surfaces"


def bootstrap() -> None:
    """Fail closed without scanning workflows or writing an embedding store."""
    raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
