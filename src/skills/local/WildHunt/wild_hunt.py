"""Retired Wild Hunt compatibility surface.

The historical implementation cloned arbitrary repositories and installed
their contents into active skills.  Discovery and installation now require
separately authorized, supported host workflows.
"""

from __future__ import annotations


RETIRED_ERROR = "legacy_wild_hunt_retired_use_supported_skill_discovery_and_installation"


class WildHunt:
    """Keep only the pure trusted-namespace classifier for old importers."""

    TRUSTED_SOURCES = (
        "github.com/google/",
        "github.com/google-gemini/",
        "github.com/gemini-cli/",
        "github.com/Clinscott/",
    )

    @classmethod
    def is_trusted(cls, url: str) -> bool:
        return any(source in (url or "") for source in cls.TRUSTED_SOURCES)

    def search(self, query: str) -> list[str]:
        raise RuntimeError(RETIRED_ERROR)

    def ingest(self, url: str, skill_name: str) -> None:
        raise RuntimeError(RETIRED_ERROR)

    def _direct_ingest(self, *args: object, **kwargs: object) -> None:
        raise RuntimeError(RETIRED_ERROR)

    def _sandbox_ingest(self, *args: object, **kwargs: object) -> None:
        raise RuntimeError(RETIRED_ERROR)

    def _write_metadata(self, *args: object, **kwargs: object) -> None:
        raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
