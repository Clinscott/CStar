import json
import pytest
import os
from unittest.mock import MagicMock, patch, mock_open
from src.core.engine.bifrost import SkillForge

@pytest.fixture
def forge(tmp_path):
    log_path = tmp_path / "failures.jsonl"
    return SkillForge(failure_log_path=str(log_path))

class TestSkillForge:
    def test_record_failure(self, forge):
        forge.record_failure("test query", 0.5)
        
        with open(forge.failure_log, 'r') as f:
            lines = f.readlines()
            assert len(lines) == 1
            data = json.loads(lines[0])
            assert data['query'] == "test query"
            assert data['score'] == 0.5

    def test_analyze_voids_empty(self, forge):
        # Currently analyze_voids returns empty list in implementation
        assert forge.analyze_voids() == []

    @patch("src.core.engine.bifrost.open", new_callable=mock_open)
    @patch("src.core.engine.bifrost.hash")
    def test_synthesize_bridge(self, mock_hash, mock_file, forge):
        mock_hash.return_value = 1234
        intent_cluster = ["query1", "query2"]
        
        bridge_name = forge.synthesize_bridge(intent_cluster)
        
        assert bridge_name == "bridge_1234.py"
        mock_file.assert_called_with(".agents/skills/bridge_1234.py", 'w')
        
        handle = mock_file()
        written_content = "".join(call.args[0] for call in handle.write.call_args_list)
        assert "Synthetic Bridge Skill: bridge_1234.py" in written_content
        assert "query1" in written_content
        assert "query2" in written_content
