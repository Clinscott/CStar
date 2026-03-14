"""
[Ω] Runtime Environment Helpers
Purpose: Resolve project-local runtimes across Windows and Unix hosts.
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def resolve_project_python(project_root: Path) -> Path:
    """Returns the preferred Python executable for the current host."""
    candidates: list[Path] = []
    if os.name == "nt":
        candidates.extend(
            [
                project_root / ".venv" / "Scripts" / "python.exe",
                project_root / ".venv" / "bin" / "python",
            ]
        )
    else:
        candidates.extend(
            [
                project_root / ".venv" / "bin" / "python",
                project_root / ".venv" / "Scripts" / "python.exe",
            ]
        )

    for candidate in candidates:
        if candidate.exists():
            return candidate

    executable = Path(sys.executable)
    if executable.exists():
        return executable

    fallback_name = "python.exe" if os.name == "nt" else "python3"
    resolved = shutil.which(fallback_name) or shutil.which("python")
    return Path(resolved) if resolved else Path(fallback_name)


def resolve_quarto_binary() -> str | None:
    """Returns a usable Quarto executable when one is available."""
    quarto = shutil.which("quarto")
    if quarto:
        return quarto

    if os.name == "nt":
        windows_quarto = Path(r"C:\Program Files\Quarto\bin\quarto.exe")
        if windows_quarto.exists():
            return str(windows_quarto)

    return None
