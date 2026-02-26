from src.core.engine.vector import SovereignVector
from src.core.sv_engine import SovereignEngine


class TestLexiconLift:
    def test_lexicon_lift_trigger(self, monkeypatch):
        """
        Verify that an unknown term triggers the proactive search logic.
        Note: We mock the search response to avoid API costs.
        """
        # Mock BraveSearch
        class MockBraveSearch:
            def search(self, query):
                return [{"description": "A fictional term for testing Bifröst integration."}]

        monkeypatch.setattr("src.core.sv_engine.BraveSearch", MockBraveSearch)

        # Mock Cortex to check if add_node is called
        added_nodes = []
        class MockCortex:
            def __init__(self, *args, **kwargs) -> None: pass
            def add_node(self, term, data):
                added_nodes.append((term, data))

        monkeypatch.setattr("src.core.sv_engine.Cortex", MockCortex)

        # Create engine
        engine = SovereignEngine()

        # Create a mock vector engine that sees 'quasibartle' as unknown
        class MockVector(SovereignVector):
            def __init__(self, *args, **kwargs) -> None:
                self.vocab = {"tell", "me", "about"}
                self.stopwords = {"the", "and"}
            def search(self, query):
                return [{"trigger": "none", "score": 0.1, "is_global": False}]

        mock_vec = MockVector("dummy", "dummy", "dummy")

        # Run the lift logic
        engine._proactive_lexicon_lift("Tell me about quasibartle", mock_vec)

        assert len(added_nodes) > 0
        assert "LEXICON:quasibartle" in added_nodes[0][0]
        assert "fictional term" in added_nodes[0][1]["definition"]
