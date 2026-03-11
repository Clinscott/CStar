
import re
import string
from typing import Any

class VectorCalculus:
    _GLOBAL_NORM_CACHE: dict[str, str] = {}
    _GLOBAL_EXPANSION_CACHE: dict[str, set[str]] = {}
    _TRANS_TABLE = str.maketrans('', '', string.punctuation)

    def __init__(self, stopwords: set[str], thesaurus: dict[str, set[str]]):
        self.stopwords = stopwords
        self.thesaurus = thesaurus
        self._inverted_syns: dict[str, set[str]] = {}
        for key, values in self.thesaurus.items():
            for v in values:
                self._inverted_syns.setdefault(v, set()).add(key)

    def normalize(self, text: str) -> str:
        if not text: return ""
        if text in self._GLOBAL_NORM_CACHE: return self._GLOBAL_NORM_CACHE[text]
        clean = text.translate(self._TRANS_TABLE).lower()
        tokens = [w for w in clean.split() if w not in self.stopwords]
        result = " ".join(tokens)
        self._GLOBAL_NORM_CACHE[text] = result
        return result

    def expand_query(self, tokens: set[str]) -> dict[str, set[str]]:
        expansion = {}
        for t in tokens:
            if t in self._GLOBAL_EXPANSION_CACHE:
                expansion[t] = self._GLOBAL_EXPANSION_CACHE[t]
                continue
            syns = {t}
            if t in self.thesaurus: syns.update(self.thesaurus[t])
            if t in self._inverted_syns: syns.update(self._inverted_syns[t])
            self._GLOBAL_EXPANSION_CACHE[t] = syns
            expansion[t] = syns
        return expansion

    def score_intent(self, result: dict, expansion: dict, original_tokens: set, all_expanded: set) -> dict:
        if result.get("_neural_boost"):
            result["score"] = 1.0
            return result

        # Use pre-calculated target tokens if available
        if "_target_tokens" not in result:
            target_text = result.get('intent', '').lower()
            result["_target_tokens"] = set(re.findall(r'\\w+', target_text))
        
        target_tokens = result["_target_tokens"]
        if not target_tokens:
            result["score"] = 0.0
            return result

        # [Ω] FAST INTERSECT: Python's set operations are highly optimized
        lex_count = len(original_tokens & target_tokens)
        lex_score = lex_count / len(original_tokens) if original_tokens else 0

        sem_count = len(all_expanded & target_tokens)
        sem_score = sem_count / len(original_tokens) if original_tokens else 0

        alignment_bonus = 0.0
        for syns in expansion.values():
            if syns & target_tokens:
                alignment_bonus += 0.1

        result["score"] = round((lex_score * 0.6) + (sem_score * 0.3) + alignment_bonus, 2)
        return result
