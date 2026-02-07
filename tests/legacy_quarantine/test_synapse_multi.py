import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.agent', 'scripts')))

import pytest
import json
import shutil
from unittest.mock import MagicMock, patch
from synapse_sync import Synapse, ConfigurationError

@pytest.fixture
def mock_synapse(tmp_path):
    core_dir = tmp_path / "KnowledgeCore"
    core_dir.mkdir()
    
    config = {
        "KnowledgeCore": str(core_dir),
        "KnowledgeCores": {
            "primary": str(core_dir),
            "team": str(tmp_path / "TeamCore")
        }
    }
    
    with patch('synapse_sync.Synapse._load_json_safe', return_value=config):
        with patch('os.path.exists', return_value=True):
            # We need to mock the constructor's exit paths
            with patch('synapse_sync.KnowledgeExtractor', return_value=MagicMock()):
                synapse = Synapse(remote_alias="primary")
                return synapse

def test_resolve_remote_valid_alias(mock_synapse):
    with patch('os.path.exists', return_value=True):
        path, source = mock_synapse._resolve_remote("primary")
        assert "KnowledgeCore" in path
        assert "primary" in source

def test_resolve_remote_case_insensitive(mock_synapse):
    with patch('os.path.exists', return_value=True):
        path, source = mock_synapse._resolve_remote("PRIMARY")
        assert "KnowledgeCore" in path
        assert "primary" in source

def test_resolve_remote_legacy_fallback(mock_synapse):
    mock_synapse.config = {"KnowledgeCore": "/legacy/path"}
    with patch('os.path.exists', return_value=True):
        path, source = mock_synapse._resolve_remote("any")
        assert "legacy" in path
        assert "Legacy" in source

def test_resolve_remote_unknown_alias_fallback(mock_synapse):
    # If alias not in cores, and exists(alias_path) is False
    mock_synapse.config = {
        "KnowledgeCore": "/legacy/path",
        "KnowledgeCores": {"primary": "/primary/path"}
    }
    with patch('os.path.exists', side_effect=lambda p: "/legacy/path" in p):
        path, source = mock_synapse._resolve_remote("unknown")
        assert "legacy" in path
        assert "Legacy" in source

def test_list_remotes(mock_synapse, capsys):
    mock_synapse.config = {
        "KnowledgeCores": {"primary": "/primary", "team": "/team"},
        "KnowledgeCore": "/primary"
    }
    with patch('os.path.exists', return_value=True):
        mock_synapse.list_remotes()
        captured = capsys.readouterr()
        assert "PRIMARY" in captured.out
        assert "TEAM" in captured.out
