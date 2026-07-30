"""Retired compatibility surface for the former Python CStar dispatcher.

The canonical CStar command and lifecycle surfaces are implemented by the Node
kernel.  This module remains importable only so stale imports fail with one
stable, side-effect-free error instead of reviving filesystem discovery or
subprocess dispatch.
"""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_CSTAR_DISPATCHER_ERROR = (
    "legacy_python_cstar_dispatcher_retired_use_node_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_CSTAR_DISPATCHER_ERROR)


class CorvusDispatcher:
    """Compatibility tombstone for the retired Python dispatcher."""

    __slots__ = ()

    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs
        _retired()

    def _discover_all(self) -> NoReturn:
        _retired()

    def _load_registry_manifest(self) -> NoReturn:
        _retired()

    def show_help(self) -> NoReturn:
        _retired()

    def run(self, args: list[str]) -> NoReturn:
        del args
        _retired()

    def _execute_skill(self, skill_name: str, args: list[str]) -> NoReturn:
        del skill_name, args
        _retired()

    def _record_agentic_heartbeat(
        self,
        cmd: str,
        latency: float,
        tokens: int,
        error: float,
    ) -> NoReturn:
        del cmd, latency, tokens, error
        _retired()


def main() -> NoReturn:
    """Fail closed for stale console or direct-module invocations."""

    _retired()


if __name__ == "__main__":
    main()
