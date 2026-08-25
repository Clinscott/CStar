#!/usr/bin/env python3
"""Retired CStar-to-Taliesin execution wrapper."""

RETIRED_ERROR = "legacy_cross_spoke_karpathy_wrapper_retired_use_authorized_researcher_route"


def _resolve_spoke_entrypoint() -> None:
    """Never discover or execute a neighboring spoke from CStar."""
    raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
