"""Retired legacy search orchestrator.

Search, provider fallback, rendering, recording, and automated action dispatch
belong to current CStar or Researcher surfaces.  This compatibility symbol is
kept only so stale imports fail with a deterministic boundary error.
"""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR = (
    "legacy_python_sovereign_component_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR)


class SovereignOrchestrator:
    """Fail-closed compatibility shell for the retired orchestrator."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def execute_search(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def web_fallback(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def create_payload(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
