import pytest
from types import MappingProxyType
from unittest.mock import MagicMock, patch
from src.core.payload import IntentPayload
from src.core.engine.vector import SovereignVector

# ==============================================================================
# Suite 1: Intent Rigidity
# ==============================================================================

class TestIntentImmutability:
    """[ODIN] Proves that IntentPayload is physically and logically immutable."""

    def test_immutability_breach_raises_typeerror(self):
        """Assert that attempting to mutate system_meta or extracted_entities raises a TypeError."""
        payload = IntentPayload(
            system_meta={"origin": "user"},
            intent_raw="Hello",
            intent_normalized="hello",
            target_workflow="chat",
            extracted_entities={"target": "world"}
        )

        # 1. Assert type is MappingProxyType
        assert isinstance(payload.system_meta, MappingProxyType)
        assert isinstance(payload.extracted_entities, MappingProxyType)

        # 2. Assert direct mutation fails
        with pytest.raises(TypeError):
            payload.system_meta["origin"] = "malicious"

        # 3. Assert entity mutation fails
        with pytest.raises(TypeError):
            payload.extracted_entities["target"] = "void"


class TestSovereignAnchorPrecision:
    """[ODIN] Proves that Lexical Anchors override Semantic Bias."""

    @patch("src.core.engine.vector.MemoryDB")
    def test_lexical_anchor_overrides_semantic_bias(self, mock_db_class):
        """
        Feed a query where semantic distance favors the wrong intent (0.8),
        but exact lexical token overlap triggers the Sovereign Anchor (score > 1.30).
        """
        # Setup Mock DB
        mock_db = mock_db_class.return_value
        # Semantic search returns a decent score for a "Wrong" intent
        mock_db.search_intent.return_value = [
            {"trigger": "/trash", "score": 0.8},
            {"trigger": "/hunt-demon", "score": 0.1} 
        ]

        # Initialize Vector Engine
        vector = SovereignVector(None, None, None)

        # Query: "demon hunt" -> Overlaps with "/hunt-demon"
        results = vector.search("demon hunt")

        # ASSERTIONS:
        # 1. /hunt-demon should be the winner
        assert results[0]["trigger"] == "/hunt-demon"
        
        # 2. Score should be boosted past the Sovereign Anchor threshold (max(score, 1.30...))
        assert results[0]["score"] >= 1.30
        assert "Hybrid" in results[0]["note"]
