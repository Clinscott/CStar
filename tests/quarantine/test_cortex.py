
import pytest

from src.core.engine.cortex import Cortex


@pytest.fixture
def mock_project(tmp_path):
    """Creates a mock project structure for Cortex."""
    (tmp_path / "AGENTS.qmd").write_text("# AGENTS\nLaw 1: Be helpful.", encoding='utf-8')
    (tmp_path / "memories.qmd").write_text("# Memories\nFact: Sky is blue.", encoding='utf-8')

    # Create stopwords
    data_dir = tmp_path / "src" / "data"
    data_dir.mkdir(parents=True)
    (data_dir / "stopwords.json").write_text("[]", encoding='utf-8')

    return tmp_path

def test_cortex_ingestion(mock_project):
    """Verifies that Cortex ingests documentation."""
    # We mock SovereignVector to avoid real ChromaDB
    with pytest.MonkeyPatch().context() as mp:
        class MockBrain:
            def __init__(self, **kwargs):
                self.skills = {}
            def add_skill(self, trigger, text):
                self.skills[trigger] = text
            def build_index(self): pass

        mp.setattr("src.core.engine.cortex.SovereignVector", MockBrain)

        cortex = Cortex(mock_project, mock_project / "base")

        # In the refactored code, it uses headers
        # Current header starts as name, then changes when # is found
        assert "AGENTS > AGENTS" in cortex.brain.skills
        assert "Law 1: Be helpful." in cortex.brain.skills["AGENTS > AGENTS"]
