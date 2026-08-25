"""Import-safe tombstone for the retired Python bootstrap.

Runtime configuration and persona projection belong to bounded CStar kernel
surfaces.  This compatibility module deliberately does not inspect repository
configuration, dotenv files, environment variables, or the secret vault.
"""

from __future__ import annotations

from typing import NoReturn


RETIRED_PYTHON_BOOTSTRAP_ERROR = (
    "legacy_python_bootstrap_retired_use_cstar_kernel"
)

# Compatibility names retained for callers which only inspect module state.
PROJECT_ROOT = None
_BOOTSTRAPPED = False


def _retired(*_args: object, **_kwargs: object) -> NoReturn:
    raise RuntimeError(RETIRED_PYTHON_BOOTSTRAP_ERROR)


def load_dotenv(*_args: object, **_kwargs: object) -> NoReturn:
    """Reject the former direct dotenv loader before any path is inspected."""

    _retired()


class SovereignBootstrap:
    """Historical bootstrap type retained only as a fail-closed boundary."""

    @staticmethod
    def execute() -> NoReturn:
        """Reject direct bootstrap; use supported CStar status/runtime surfaces."""

        _retired()
