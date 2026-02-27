"""
[ENGINE] Dialogue Engine
Lore: "The tongue of the ravens."
Purpose: Advanced dialogue retrieval with tag-aware filtering and short-term memory.
"""

import random
from collections import deque
from pathlib import Path
from typing import Any

import yaml


class DialogueEngine:
    """
    Dialogue engine with tag-aware filtering and repetition avoidance.
    """
    def __init__(self, phrases_path: str | Path | None) -> None:
        """
        Initializes the dialogue engine.

        Args:
            phrases_path: Path to the phrases.yaml database.
        """
        self.phrase_data: dict[str, Any] = {}
        self.history: deque = deque(maxlen=5)  # Avoid repeating the last 5 phrases
        if phrases_path:
            self._load(Path(phrases_path))

    def _load(self, path: Path) -> None:
        """Loads phrases from the YAML database."""
        if not path.exists():
            return
        try:
            with open(path, encoding='utf-8') as f:
                self.phrase_data = yaml.safe_load(f) or {}
        except Exception:
            pass

    def _score_candidate(self, entry: dict[str, Any], context: dict[str, Any]) -> int:
        """
        Helper to score a single dialogue candidate based on context.

        Args:
            entry: A dictionary containing the phrase and its tags.
            context: Contextual parameters for scoring.

        Returns:
            An integer score.
        """
        score = 1
        phrase = entry.get('phrase', '').lower()
        tags = entry.get('tags', [])

        if context.get("compliance_breach"):
            if any(w in phrase for w in ["shatters", "hel"]):
                score += 10
            if "compliance_breach" in tags:
                score += 10

        error_type = context.get("error_type", "").lower()
        if error_type:
            keyword = error_type.replace('error', '').strip()
            if error_type in phrase or keyword in phrase:
                score += 5
            if any(error_type in t.lower() or t.lower() in error_type for t in tags):
                score += 10

        if "setback" in context and "setback" in tags:
            score += 5
        return score

    def _select_final_phrase(self, scored_candidates: list[tuple[int, str]]) -> str:
        """
        Helper to resolve top candidates and handle history to avoid repetition.

        Args:
            scored_candidates: List of (score, phrase) tuples.

        Returns:
            The selected phrase string.
        """
        if not scored_candidates:
            return "..."

        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        top_score = scored_candidates[0][0]
        best_matches = [p for s, p in scored_candidates if s == top_score]

        # Filter out recently used phrases
        final_candidates = [p for p in best_matches if p not in self.history]
        selection = random.choice(final_candidates if final_candidates else best_matches)

        self.history.append(selection)
        return selection

    def get(self, persona: str, intent: str, context: dict[str, Any] | None = None) -> str:
        """
        Retrieves a contextually scored phrase for a persona and intent.

        Args:
            persona: Active persona (ODIN/ALFRED).
            intent: Dialogue intent (e.g., GREETING).
            context: Optional scoring context.

        Returns:
            The selected phrase string.
        """
        persona = (persona or "").upper()
        pool = self.phrase_data.get(persona, {}).get(intent, [])
        if not pool:
            return "..."

        ctx = context or {}
        scored_candidates = [(self._score_candidate(e, ctx), e.get('phrase', '...')) for e in pool]
        return self._select_final_phrase(scored_candidates)

    def __repr__(self) -> str:
        personas = list(self.phrase_data.keys())
        return f"<DialogueEngine: {len(personas)} personas loaded>"
