#!/usr/bin/env python3
"""Retired direct bead-ledger projection wrapper."""

RETIRED_ERROR = "legacy_bead_qmd_projection_retired_use_cstar_kernel_lifecycle"


def main() -> int:
    """Never read a side ledger or write a tasks projection."""
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
