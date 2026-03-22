import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.builder import SovereignBuilder

@pytest.fixture
def builder(tmp_path):
    project_root = tmp_path / "project"
    base_path = tmp_path / "base"
    project_root.mkdir()
    base_path.mkdir()
    thresholds = {"REC": 1.5}
    return SovereignBuilder(project_root, base_path, thresholds)

class TestSovereignBuilder:
    @patch("src.core.engine.builder.SovereignVector")
    @patch("src.core.engine.builder.InstructionLoader")
    @patch("src.core.engine.builder.MemoryDB")
    def test_build_vector_engine(self, mock_memory_db_class, mock_loader_class, mock_vector_class, builder):
        mock_memory_db = mock_memory_db_class.return_value
        mock_loader = mock_loader_class.return_value
        mock_vector = mock_vector_class.return_value
        
        # Test paths
        skills_db_path = builder.project_root / "skills.db"
        skills_db_path.touch()
        
        vector = builder.build_vector_engine(skills_db_path)
        
        # Check initialization
        mock_memory_db_class.assert_called_with(str(builder.base_path))
        mock_loader_class.assert_called_with(str(builder.project_root))
        
        # Check source added
        mock_loader.add_source.assert_called_with(str(skills_db_path))
        
        # Check vector initialization
        thesaurus = str(builder.project_root / "src" / "data" / "thesaurus.qmd")
        corrections = str(builder.base_path / "corrections.json")
        stopwords = str(builder.project_root / "src" / "data" / "stopwords.json")
        mock_vector_class.assert_called_with(thesaurus, corrections, stopwords)
        
        # Check skill loading and index building
        mock_vector.load_core_skills.assert_called_once()
        mock_vector.load_skills_from_dir.assert_called_with(str(builder.project_root / "src" / "skills" / "local"))
        mock_vector.build_index.assert_called_once()
        
        assert vector == mock_vector

    @patch("src.core.engine.builder.SovereignVector")
    @patch("src.core.engine.builder.InstructionLoader")
    @patch("src.core.engine.builder.MemoryDB")
    def test_build_vector_engine_no_skills_db(self, mock_memory_db_class, mock_loader_class, mock_vector_class, builder):
        mock_loader = mock_loader_class.return_value
        
        skills_db_path = builder.project_root / "missing.db" # Does not exist
        
        builder.build_vector_engine(skills_db_path)
        
        # add_source should NOT be called
        mock_loader.add_source.assert_not_called()
