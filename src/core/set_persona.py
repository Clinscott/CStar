#!/usr/bin/env python3
"""Retired direct persona mutation compatibility entrypoint."""

from __future__ import annotations

from pathlib import Path


RETIREMENT_MESSAGE = (
    "Direct persona mutation is retired. Persona is a style-only Hall projection "
    "exposed through cstar_status; use an authorized CStar lifecycle change."
)


class PersonaManager:
    """Preserve the import surface while refusing legacy mutation."""

    ALLOWED_PERSONAS = ["ODIN", "ALFRED"]

    def __init__(self, target_root: Path | None = None) -> None:
        self.project_root = target_root or Path.cwd()
        self.old_persona = "UNAVAILABLE"

    def switch_persona(self, _persona: str, interactive: bool = True) -> None:
        del interactive
        raise RuntimeError(RETIREMENT_MESSAGE)

    @staticmethod
    def set_persona(persona: str, root: str | None = None) -> None:
        PersonaManager(Path(root) if root else None).switch_persona(persona, interactive=False)


def main() -> None:
    raise SystemExit(RETIREMENT_MESSAGE)


if __name__ == "__main__":
    main()
