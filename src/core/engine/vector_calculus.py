"""
[SPOKE] Vector Calculus
Lore: "The math of the Nine Realms."
Purpose: Handle tokenization, normalization, expansion, and semantic scoring.
"""

import re
from typing import Any

class VectorCalculus:
    def __init__(self, stopwords: set[str], thesaurus: dict[str, set[str]]):
        self.stopwords = stopwords
        self.thesaurus = thesaurus
        self._expansion_cache: dict[str, set[str]] = {}

    def normalize(self, text: str) -> str:
        """Strips symbols, lowers, and removes stopwords."""
        if not text: return ""
        text = re.sub(r'[^\w\s]', '', text.lower())
        tokens = [w for w in text.split() if w not in self.stopwords]
        return " ".join(tokens)

    def expand_query(self, tokens: set[str]) -> dict[str, set[str]]:
        """Finds synonyms for each token via the thesaurus."""
        expansion = {}
        for t in tokens:
            if t in self._expansion_cache:
                expansion[t] = self._expansion_cache[t]
                continue
            
            syns = {t}
            if t in self.thesaurus:
                syns.update(self.thesaurus[t])
            # Reverse lookup
            for key, values in self.thesaurus.items():
                if t in values:
                    syns.add(key)
            
            self._expansion_cache[t] = syns
            expansion[t] = syns
        return expansion

    def score_intent(self, result: dict, expansion: dict, original_tokens: set, all_expanded: set) -> dict:
        """Calculates a hybrid semantic/lexical score for a search result."""
        target_text = result.get('intent', '').lower()
        target_tokens = set(re.findall(r'\w+', target_text))
        
        if not target_tokens:
            return {**result, "score": 0.0}

        # 1. Lexical Score (Direct matches)
        lexical_hits = original_tokens.intersection(target_tokens)
        lex_score = len(lexical_hits) / len(original_tokens) if original_tokens else 0

        # 2. Semantic Score (Synonym matches)
        semantic_hits = all_expanded.intersection(target_tokens)
        sem_score = len(semantic_hits) / len(all_expanded) if all_expanded else 0

        # 3. Bonus for specific token alignment
        alignment_bonus = 0
        for syns in expansion.values():
            if syns.intersection(target_tokens):
                alignment_bonus += 0.1

        final_score = (lex_score * 0.6) + (sem_score * 0.3) + alignment_bonus
        return {**result, "score": round(final_score, 2)}
