#!/usr/bin/env python3
"""Fail-closed compatibility surface for the retired direct Brave lane."""

from src.core.sovereign_hud import SovereignHUD


class ExternalResearchLaneDecommissioned(RuntimeError):
    """Raised when a caller attempts to bypass the Researcher receipt lane."""


class BraveSearch:
    """Compatibility object that performs no network, quota, or filesystem work."""

    def is_quota_available(self) -> bool:
        return False

    def search(self, query: str) -> list[dict[str, str]]:
        del query
        SovereignHUD.persona_log(
            "WARN",
            "Direct Brave search is decommissioned. Use an authorized Researcher request.",
        )
        return []

    def search_knowledge(self, intent: str) -> list[dict[str, str]]:
        return self.search(intent)


def main() -> None:
    raise ExternalResearchLaneDecommissioned(
        "Direct Brave search is decommissioned; route research through CStar."
    )


if __name__ == "__main__":
    main()
