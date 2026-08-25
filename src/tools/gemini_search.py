#!/usr/bin/env python3
"""Fail-closed compatibility surface for the retired Gemini search directive."""

from src.core.sovereign_hud import SovereignHUD
from src.tools.brave_search import ExternalResearchLaneDecommissioned


class GeminiSearch:
    """Compatibility object that cannot emit host directives or search."""

    def is_available(self) -> bool:
        return False

    def search(self, query: str) -> list[dict[str, str]]:
        del query
        SovereignHUD.persona_log(
            "WARN",
            "Direct Gemini search is decommissioned. Use an authorized Researcher request.",
        )
        return []


def main() -> None:
    raise ExternalResearchLaneDecommissioned(
        "Direct Gemini search is decommissioned; route research through CStar."
    )


if __name__ == "__main__":
    main()
