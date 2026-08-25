#!/usr/bin/env python3
"""Retired provider-backed manuscript style extractor."""

RETIRED_ERROR = "legacy_user_style_extractor_retired_use_authorized_researcher_workflow"


async def main() -> int:
    """Perform no source read, provider request, or contract write."""
    return 2


if __name__ == "__main__":
    import asyncio

    raise SystemExit(asyncio.run(main()))
