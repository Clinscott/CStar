import unittest
from src.core.engine.vector_calculus import VectorCalculus

class TestVectorCalculus(unittest.TestCase):
    def setUp(self):
        self.stopwords = {"the", "a", "is"}
        self.thesaurus = {"start": {"begin", "commence"}}
        # Clear caches to ensure isolation
        VectorCalculus._GLOBAL_NORM_CACHE.clear()
        VectorCalculus._GLOBAL_EXPANSION_CACHE.clear()
        self.calc = VectorCalculus(self.stopwords, self.thesaurus)

    def test_normalize(self):
        text = "The start is beginning!"
        normalized = self.calc.normalize(text)
        # "the", "is" are stopwords. "!" is punctuation.
        self.assertEqual(normalized, "start beginning")

    def test_expand_query(self):
        tokens = {"start", "commence"}
        expansion = self.calc.expand_query(tokens)
        
        self.assertIn("begin", expansion["start"])
        self.assertIn("commence", expansion["start"])
        # "commence" is a synonym for "start" in thesaurus, 
        # so "start" should be in expansion of "commence" due to inverted_syns
        self.assertIn("start", expansion["commence"])

    def test_score_intent_neural_boost(self):
        result = {"_neural_boost": True}
        scored = self.calc.score_intent(result, {}, set(), set())
        self.assertEqual(scored["score"], 1.0)

    def test_score_intent_basic(self):
        result = {"intent": "start the engine"}
        original_tokens = {"start"}
        expansion = {"start": {"start", "begin", "commence"}}
        all_expanded = {"start", "begin", "commence"}
        
        scored = self.calc.score_intent(result, expansion, original_tokens, all_expanded)
        
        # result["_target_tokens"] will be set to {"start", "the", "engine"}
        # Wait, the regex in score_intent is r'\w+'
        # lex_count: len({"start"} & {"start", "the", "engine"}) = 1
        # lex_score: 1 / 1 = 1.0
        # sem_count: len({"start", "begin", "commence"} & {"start", "the", "engine"}) = 1
        # sem_score: 1 / 1 = 1.0
        # alignment_bonus: 0.1 (syns of "start" intersect target)
        # score: (1.0 * 0.6) + (1.0 * 0.3) + 0.1 = 1.0
        
        self.assertEqual(scored["score"], 1.0)

    def test_score_intent_no_match(self):
        result = {"intent": "other things"}
        original_tokens = {"start"}
        expansion = {"start": {"start", "begin"}}
        all_expanded = {"start", "begin"}
        
        scored = self.calc.score_intent(result, expansion, original_tokens, all_expanded)
        self.assertEqual(scored["score"], 0.0)

if __name__ == "__main__":
    unittest.main()
