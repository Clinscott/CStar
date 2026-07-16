"""Retired ambient host-capability inference compatibility surface."""

from enum import Enum, auto
from typing import NoReturn


RETIRED_ENV_ADAPTER_ERROR = (
    "legacy_environment_adapter_retired_use_host_enforceable_capabilities"
)


class HostCapability(Enum):
    """Compatibility names only; they grant no execution capability."""

    SUB_AGENTS = auto()
    LOCAL_JIT = auto()
    HEADLESS = auto()


def _retired() -> NoReturn:
    raise RuntimeError(RETIRED_ENV_ADAPTER_ERROR)


class EnvAdapter:
    """Reject ambient capability inference before inspecting the host."""

    def __init__(self) -> None:
        _retired()

    def _detect_capability(self) -> NoReturn:
        _retired()

    def get_execution_plan(self, _domain: str, _top_skill: str) -> NoReturn:
        _retired()
