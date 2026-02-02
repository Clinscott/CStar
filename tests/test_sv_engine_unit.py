import unittest
import sys
import os
import json
from unittest.mock import MagicMock, patch

# Add script path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import sv_engine
if isinstance(sv_engine, MagicMock) or 'MagicMock' in str(type(sv_engine)):
    import importlib
    importlib.reload(sv_engine)

from sv_engine import SovereignVector, HUD

class TestSovereignVectorUnit(unittest.TestCase):
    def setUp(self):
        self.engine = SovereignVector()

    def test_tokenization_basic(self):
        """Test basic tokenization and stopword removal."""
        text = "The quick brown fox jumps over the lazy dog"
        # Defaults: 'the', 'over' might be stopwords depending on implementation
        tokens = self.engine.tokenize(text)
        self.assertIn("quick", tokens)
        self.assertIn("fox", tokens)
        self.assertNotIn("the", tokens) # Assuming 'the' is a default stopword

    def test_tokenization_empty(self):
        """Test tokenization of empty string."""
        self.assertEqual(self.engine.tokenize(""), [])
        self.assertEqual(self.engine.tokenize(None), [])

    def test_expand_query_stemming(self):
        """Test simple stemming logic in expansion."""
        weights = self.engine.expand_query("running")
        # Should have 'runn' or similar depending on simple rule
        # Rule: if endswith 'ing', weights[t[:-3]] = 0.8
        self.assertIn("runn", weights) 
        self.assertAlmostEqual(weights["runn"], 0.8)

    def test_vectorization_math(self):
        """Test vector math and similarity."""
        # Manually inject vocab/idf for control
        self.engine.vocab = {'apple', 'banana'}
        self.engine.idf = {'apple': 1.0, 'banana': 1.0}
        
        # Vector 1: apple
        v1 = self.engine._vectorize({'apple': 1.0})
        # Vector 2: banana
        v2 = self.engine._vectorize({'banana': 1.0})
        # Vector 3: apple banana
        v3 = self.engine._vectorize({'apple': 1.0, 'banana': 1.0})

        # Similarity v1 vs v2 (orthogonal) should be 0
        self.assertEqual(self.engine.similarity(v1, v2), 0.0)
        
        # Similarity v1 vs v1 should be 1.0
        self.assertAlmostEqual(self.engine.similarity(v1, v1), 1.0)
        
        # Similarity v1 vs v3 should be > 0
        self.assertTrue(self.engine.similarity(v1, v3) > 0)

    def test_add_skill(self):
        """Test adding a skill updates vocab."""
        initial_vocab_size = len(self.engine.vocab)
        self.engine.add_skill("/test-skill", "unique_word_123")
        self.assertIn("unique_word_123", self.engine.vocab)
        self.assertIn("/test-skill", self.engine.skills)

class TestHUD(unittest.TestCase):
    @patch('builtins.print')
    def test_box_drawing(self, mock_print):
        """Test that HUD methods execute without error and call print."""
        HUD.box_top("TEST TITLE")
        self.assertTrue(mock_print.called)
        
    def test_progress_bar(self):
        """Test progress bar string generation."""
        bar = HUD.progress_bar(0.5, width=10)
        self.assertIn("█" * 5, bar)
        self.assertIn("░" * 5, bar)

    def test_theme_selection(self):
        """Test theme colors based on Persona."""
        HUD.PERSONA = "ODIN"
        theme = HUD._get_theme()
        self.assertEqual(theme['title'], "Ω ODIN ENGINE Ω")
        
        HUD.PERSONA = "ALFRED"
        theme = HUD._get_theme()
        self.assertEqual(theme['title'], "C* NEURAL TRACE")

if __name__ == '__main__':
    unittest.main()
