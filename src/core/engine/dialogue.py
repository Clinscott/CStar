from pathlib import Path
import random

import random
import yaml
from pathlib import Path
from collections import deque

class DialogueEngine:
    """[ALFRED] Advanced dialogue engine with tag-aware filtering and short-term memory."""
    def __init__(self, phrases_path: str | Path | None):
        self.phrase_data: dict = {}
        self.history = deque(maxlen=5)  # Avoid repeating the last 5 phrases
        if phrases_path:
            self._load(Path(phrases_path))

    def _load(self, path: Path) -> None:
        """Load phrases from YAML database."""
        if not path.exists():
            return
        try:
            with open(path, 'r', encoding='utf-8') as f:
                self.phrase_data = yaml.safe_load(f) or {}
        except Exception:
            pass

    def get(self, persona: str, intent: str, context: dict = None) -> str:
        """[ALFRED] Get a contextually scored phrase for a persona and intent."""
        context = context or {}
        persona = persona.upper()
        pool = self.phrase_data.get(persona, {}).get(intent, [])
        
        if not pool:
            return "..."

        # Score candidates based on context matches
        scored_candidates = []
        for entry in pool:
            score = 1 # Base score for any phrase in the pool
            phrase = entry.get('phrase', '').lower()
            tags = entry.get('tags', [])

            # Odin: Check for defiance keywords
            if context.get("compliance_breach"):
                if any(w in phrase for w in ["shatters", "hel"]):
                    score += 10
                if "compliance_breach" in tags:
                    score += 10
            
            # Alfred: Check for error type keywords
            error_type = context.get("error_type", "").lower()
            if error_type:
                # Flexible match: check if error_type is in phrase/tags OR vice versa
                # Also check common shorthand (e.g., 'syntax' for 'SyntaxError')
                keyword = error_type.replace('error', '').strip()
                if error_type in phrase or keyword in phrase:
                    score += 5
                if any(error_type in t.lower() or t.lower() in error_type for t in tags):
                    score += 10
            
            # Generic setback/syntax tags
            if "setback" in context and "setback" in tags:
                score += 5

            scored_candidates.append((score, entry.get('phrase', '...')))

        # Sort by score descending
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        top_score = scored_candidates[0][0]
        
        # Filter for top scoring candidates and remove from history if possible
        best_matches = [p for s, p in scored_candidates if s == top_score]
        final_candidates = [p for p in best_matches if p not in self.history]
        
        # Fallback if everything is in history
        selection = random.choice(final_candidates if final_candidates else best_matches)
        
        self.history.append(selection)
        return selection

    def __repr__(self):
        personas = list(self.phrase_data.keys())
        return f"<DialogueEngine: {len(personas)} personas loaded>"
