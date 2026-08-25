"""Detached analysis compatibility for a retired direct skill-generation path."""

from __future__ import annotations

from typing import NoReturn


LEGACY_SKILL_FORGE_EFFECT_ERROR = (
    "legacy_python_skill_forge_effect_retired_use_cstar_forge"
)


class SkillForge:
    """Retain inert analysis shape while rejecting source and log writes."""

    def __init__(self, failure_log_path: str = "logs/intent_failures.jsonl") -> None:
        self.failure_log = failure_log_path
        self.threshold = 3

    def record_failure(self, query: str, confidence: float) -> NoReturn:
        """Fail before opening or appending a legacy failure log."""
        del query, confidence
        raise RuntimeError(LEGACY_SKILL_FORGE_EFFECT_ERROR)

    def analyze_voids(self) -> list[dict[str, object]]:
        """Return the historical empty detached analysis result."""
        return []

    def synthesize_bridge(self, intent_cluster: list[str]) -> NoReturn:
        """Fail before hashing a name or writing generated skill source."""
        del intent_cluster
        raise RuntimeError(LEGACY_SKILL_FORGE_EFFECT_ERROR)
