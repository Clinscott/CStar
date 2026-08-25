"""Read-only persona style profiles.

Personas may influence presentation and domain emphasis. They are never an
authority source and may not mutate project policy, configuration, or
documentation. Legacy mutation methods remain as explicit fail-closed shims so
an old caller cannot silently re-enable persona-owned policy enforcement.
"""

from pathlib import Path
from typing import Any, NoReturn


class PersonaAuthorityBoundaryError(RuntimeError):
    """Raised when legacy persona code attempts to mutate authority state."""


class PersonaStrategy:
    """Base class for immutable, presentation-only persona profiles."""

    NAME = "ALFRED"
    VOICE = "alfred"
    TONE = "measured, concise, and professional"
    DOMAIN_EMPHASIS = (
        "clear operator communication",
        "bounded assistance",
    )
    def __init__(self, project_root: str | Path) -> None:
        self.root = Path(project_root)

    def get_voice(self) -> str:
        """Return the dialogue-bank identifier used for presentation."""
        return self.VOICE

    def get_style_context(self) -> dict[str, Any]:
        """Return bounded, read-only style guidance for a renderer or prompt."""
        return {
            "persona": self.NAME,
            "voice": self.get_voice(),
            "tone": self.TONE,
            "domain_emphasis": list(self.DOMAIN_EMPHASIS),
        }

    def render_style_context(self) -> str:
        """Render a compact style line without policy or execution directives."""
        emphasis = ", ".join(self.DOMAIN_EMPHASIS)
        return (
            f"Persona style: {self.NAME}; tone: {self.TONE}; "
            f"domain emphasis: {emphasis}."
        )

    @staticmethod
    def _reject_authority_mutation(operation: str) -> NoReturn:
        raise PersonaAuthorityBoundaryError(
            f"persona operation '{operation}' is decommissioned: personas may shape "
            "tone and domain emphasis only"
        )

    # Legacy compatibility shims. These deliberately raise instead of becoming
    # no-ops: an old caller must not mistake a persona for a policy authority.
    def enforce_policy(self, **_kwargs: Any) -> dict[str, Any]:
        """Reject legacy persona-owned policy enforcement."""
        self._reject_authority_mutation("enforce_policy")

    def retheme_docs(self) -> list[str]:
        """Reject legacy mutation of AGENTS or other documentation."""
        self._reject_authority_mutation("retheme_docs")

    def _quarantine(self, _file_path: Path | str) -> Path | None:
        """Reject legacy persona-owned moves into quarantine directories."""
        self._reject_authority_mutation("quarantine")

    def _sync_configs(self, _persona: str) -> None:
        """Reject strategy-driven configuration mutation."""
        self._reject_authority_mutation("sync_configs")

    def _create_cursor_rules(self, _path: Path | str) -> None:
        """Reject legacy persona-owned policy-file creation."""
        self._reject_authority_mutation("create_cursor_rules")

    def _create_standard_agents(self, _path: Path | str) -> None:
        """Reject legacy persona-owned AGENTS creation."""
        self._reject_authority_mutation("create_standard_agents")

    def _create_minimal_agents(self, _path: Path | str) -> None:
        """Reject legacy persona-owned AGENTS creation."""
        self._reject_authority_mutation("create_minimal_agents")


class OdinStrategy(PersonaStrategy):
    """Direct, systems-oriented presentation profile."""

    NAME = "ODIN"
    VOICE = "odin"
    TONE = "direct, terse, and technically precise"
    DOMAIN_EMPHASIS = (
        "systems architecture",
        "risk visibility",
        "explicit decision boundaries",
    )


class AlfredStrategy(PersonaStrategy):
    """Measured, service-oriented presentation profile."""

    NAME = "ALFRED"
    VOICE = "alfred"
    TONE = "measured, tactful, and technically precise"
    DOMAIN_EMPHASIS = (
        "operator assistance",
        "clear handoffs",
        "practical recovery guidance",
    )


_PERSONA_REGISTRY: dict[str, type[PersonaStrategy]] = {
    "ODIN": OdinStrategy,
    "GOD": OdinStrategy,  # Read-only compatibility alias.
    "ALFRED": AlfredStrategy,
}


def get_strategy(name: str, root: str) -> PersonaStrategy:
    """Resolve a style profile, defaulting unknown names to ALFRED."""
    return PersonaRegistry.get_strategy(name, root)


class PersonaRegistry:
    """Registry for read-only persona style profiles."""

    @staticmethod
    def get_strategy(name: str, root: str) -> PersonaStrategy:
        """Look up a style strategy without granting it authority."""
        strategy_cls = _PERSONA_REGISTRY.get(name.upper(), AlfredStrategy)
        return strategy_cls(root)
