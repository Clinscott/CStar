"""Retired compatibility surface for legacy in-process skill installation.

Skill installation is a separately gated host/package operation.  It must not
be reached through a Python helper that copies files, runs scanners, or updates
promotion state outside the supported CStar lifecycle.
"""

from __future__ import annotations

import re
from pathlib import Path


RETIRED_ERROR = "legacy_skill_installer_retired_use_supported_skill_installation_surface"


def install_skill(skill_name: str, target_root: str | Path | None = None) -> None:
    """Fail closed without reading configuration or changing the filesystem."""
    raise RuntimeError(RETIRED_ERROR)


def _get_config(base_path: str | Path) -> tuple[None, str]:
    """Return the retirement contract without reading a possibly secret file."""
    return None, RETIRED_ERROR


def _sanitize_skill_name(name: str) -> str | None:
    """Preserve the deterministic compatibility validator only."""
    return SkillInstaller._sanitize_name(name)


class SkillInstaller:
    """Compatibility namespace whose action methods are permanently inert."""

    @staticmethod
    def _sanitize_name(name: str) -> str | None:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", name or ""):
            return None
        return name

    @staticmethod
    def _validate_path(base: str | Path, target: str | Path) -> bool:
        """Lexically classify a candidate path without touching the filesystem."""
        base_path = Path(base).expanduser().absolute()
        target_path = Path(target).expanduser().absolute()
        return target_path == base_path or base_path in target_path.parents

    _get_config = staticmethod(_get_config)

    @staticmethod
    def _verify_integrity(quarantine_zone: str | Path) -> tuple[bool, str]:
        return False, RETIRED_ERROR

    @staticmethod
    def _run_security_scan(quarantine_zone: str | Path) -> tuple[int, str]:
        return -1, RETIRED_ERROR

    @staticmethod
    def _promote_skill(quarantine: str | Path, dest: str | Path) -> bool:
        return False

    @staticmethod
    def _execute_installation_logic(
        src: str | Path,
        qua: str | Path,
        dst: str | Path,
        framework_root: str | Path,
    ) -> None:
        raise RuntimeError(RETIRED_ERROR)

    install = staticmethod(install_skill)


def main() -> int:
    """Return a stable nonzero status without inspecting arguments or secrets."""
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
