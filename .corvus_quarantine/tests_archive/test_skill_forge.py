import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.agent', 'scripts')))

import pytest
import shutil
from unittest.mock import MagicMock, patch
from skill_forge import SkillForge

@pytest.fixture
def mock_project(tmp_path):
    project_root = tmp_path / "project"
    project_root.mkdir()
    agent_dir = project_root / ".agent"
    agent_dir.mkdir()
    (agent_dir / "scripts").mkdir()
    (agent_dir / "skills").mkdir()
    
    # Mocking engine.cortex.Cortex._ingest and SovereignVector initializing HUD
    with patch('engine.cortex.Cortex._ingest', return_value=None):
        with patch('engine.vector.HUD', return_value=MagicMock()):
            return project_root

def test_select_archetype_triggers(mock_project):
    with patch('engine.cortex.Cortex._ingest', return_value=None):
        forge = SkillForge(str(mock_project))
        assert forge.select_archetype("create a test for engine", []) == "test"
        assert forge.select_archetype("automate the build", []) == "workflow"
        assert forge.select_archetype("parse this file", []) == "utility"
        assert forge.select_archetype("scan for errors", []) == "scanner"

def test_extract_subject(mock_project):
    with patch('engine.cortex.Cortex._ingest', return_value=None):
        forge = SkillForge(str(mock_project))
        assert forge._extract_subject("create a test for sv_engine") == "test_sv_engine"
        assert forge._extract_subject("make a new shoe page") == "new_shoe_page"
        assert forge._extract_subject("asdf") == "asdf"

def test_validate_skill_safety(mock_project):
    with patch('engine.cortex.Cortex._ingest', return_value=None):
        forge = SkillForge(str(mock_project))
        
        bad_code = "eval('print(1)')"
        is_valid, msg = forge.validate_skill(bad_code)
        assert is_valid is False
        assert "eval" in msg
        
        good_code = "def hello(): print('world')"
        is_valid, msg = forge.validate_skill(good_code)
        assert is_valid is True

@patch('skill_forge.SkillForge.analyze_pattern', return_value=[])
def test_forge_dry_run(mock_analyze, mock_project):
    with patch('engine.cortex.Cortex._ingest', return_value=None):
        forge = SkillForge(str(mock_project))
        result = forge.forge("create a test", dry_run=True)
        assert result["success"] is True
        assert "DRAFT" in result["code"]
        assert result["path"] is None
        
if __name__ == "__main__":
    pytest.main([__file__])
Line: 1
