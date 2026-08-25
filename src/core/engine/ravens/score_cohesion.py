"""Fail-closed compatibility facade for retired model-backed cohesion scoring."""

from __future__ import annotations

from pathlib import Path

from src.core.engine.ravens.retired import reject_ravens_operation


class CohesionScorer:
    def lexical_score(self, generated_text: str, true_text: str) -> float:
        del generated_text, true_text
        reject_ravens_operation("CohesionScorer.lexical_score")

    async def intent_score(self, generated_text: str, true_text: str) -> str:
        del generated_text, true_text
        reject_ravens_operation("CohesionScorer.intent_score")

    async def run_audit(self, generated_file: Path, true_file: Path) -> None:
        del generated_file, true_file
        reject_ravens_operation("CohesionScorer.run_audit")


__all__ = ["CohesionScorer"]
