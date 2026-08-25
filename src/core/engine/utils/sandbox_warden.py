"""Retired direct Docker/subprocess sandbox compatibility surface."""

from pathlib import Path
from typing import NoReturn


LEGACY_SANDBOX_WARDEN_ERROR = (
    "legacy_python_sandbox_warden_retired_use_supported_sandbox"
)


class SandboxWarden:
    """Retain construction metadata without probing Docker or starting a process."""

    def __init__(self, timeout: int = 5) -> None:
        self.timeout = timeout
        self.docker_available = False

    def run_in_sandbox(
        self,
        file_path: Path,
        args: list[str] | None = None,
        hunting: bool = False,
    ) -> NoReturn:
        """Fail before path, Docker, subprocess, network, or cleanup effects."""
        del file_path, args, hunting
        raise RuntimeError(LEGACY_SANDBOX_WARDEN_ERROR)
