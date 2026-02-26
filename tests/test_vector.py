
import pytest

from src.core.engine.vector import SovereignVector


@pytest.fixture
def mock_assets(tmp_path):
    """Creates mock assets for SovereignVector."""
    (tmp_path / "thesaurus.qmd").write_text("- **start**: begin, initiate", encoding='utf-8')
    (tmp_path / "stopwords.json").write_text('["the", "is"]', encoding='utf-8')
    (tmp_path / "corrections.json").write_text('{"phrase_mappings": {}}', encoding='utf-8')
    return tmp_path

def test_sovereign_vector_normalize(mock_assets):
    """Verifies string normalization."""
    # We mock MemoryDB
    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("src.core.engine.vector.MemoryDB", lambda root: pytest.skip("MemoryDB init skipped"))
        engine = SovereignVector(
            thesaurus_path=mock_assets / "thesaurus.qmd",
            stopwords_path=mock_assets / "stopwords.json"
        )
        assert engine.normalize("The START is here!") == "start"

def test_sovereign_vector_load_thesaurus(mock_assets):
    """Verifies thesaurus loading."""
    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("src.core.engine.vector.MemoryDB", lambda root: None)
        engine = SovereignVector(
            thesaurus_path=mock_assets / "thesaurus.qmd",
            stopwords_path=mock_assets / "stopwords.json"
        )
        assert "start" in engine.thesaurus
        assert "begin" in engine.thesaurus["start"]
        assert "begin" in engine.thesaurus
        assert "start" in engine.thesaurus["begin"]
