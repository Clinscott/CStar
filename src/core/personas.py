"""Style-only compatibility projections for historical persona callers.

Persona selection is projected by ``cstar_status``. These objects intentionally
cannot modify configuration, documentation, policy, authority, or execution.
"""

from __future__ import annotations

from pathlib import Path


class PersonaStrategy:
    """Compatibility shape with no operational authority."""

    name = "NEUTRAL"

    def __init__(self, project_root: str | Path) -> None:
        self.root = Path(project_root)

    def enforce_policy(self, **_kwargs: object) -> dict[str, object]:
        return {"authority": "style_only", "persona": self.name}

    def get_voice(self) -> str:
        return self.name.lower()

    def retheme_docs(self) -> list[str]:
        return []


class OdinStrategy(PersonaStrategy):
    name = "ODIN"


class AlfredStrategy(PersonaStrategy):
    name = "ALFRED"


_PERSONA_REGISTRY: dict[str, type[PersonaStrategy]] = {
    "ODIN": OdinStrategy,
    "O.D.I.N.": OdinStrategy,
    "ALFRED": AlfredStrategy,
    "A.L.F.R.E.D.": AlfredStrategy,
}


class PersonaRegistry:
    @staticmethod
    def get_strategy(name: str, root: str) -> PersonaStrategy:
        strategy_cls = _PERSONA_REGISTRY.get(str(name).upper(), PersonaStrategy)
        return strategy_cls(root)


def get_strategy(name: str, root: str) -> PersonaStrategy:
    return PersonaRegistry.get_strategy(name, root)
