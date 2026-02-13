import pytest
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.muninn import Muninn

class TestMuninnMemoryIdempotency:
    @pytest.fixture
    def mock_muninn(self, tmp_path):
        # Setup mock memory.qmd
        memory_file = tmp_path / "memory.qmd"
        memory_file.write_text("## Lessons Learned\n- **Existing**: This exists.\n", encoding='utf-8')
        
        # Mock client
        mock_client = MagicMock()
        
        # Initialize Muninn with tmp path
        muninn = Muninn(str(tmp_path), client=mock_client)
        return muninn, memory_file, mock_client

    def test_distill_knowledge_idempotency(self, mock_muninn):
        muninn, memory_file, mock_client = mock_muninn
        
        # Scenario: AI provides a lesson that already exists (normalized)
        mock_client.models.generate_content.return_value.text = "- **EXISTING**: This exists!"
        
        target = {"action": "test", "file": "test.py"}
        muninn._distill_knowledge(target, success=True)
        
        # Verify content hasn't changed (no duplicate appended)
        content = memory_file.read_text(encoding='utf-8')
        assert content.count("Existing") == 1
        assert content.count("EXISTING") == 0 # Normalized check prevents append

    def test_distill_knowledge_new_lesson(self, mock_muninn):
        muninn, memory_file, mock_client = mock_muninn
        
        # Scenario: AI provides a new lesson
        mock_client.models.generate_content.return_value.text = "- **New**: Something fresh."
        
        target = {"action": "test", "file": "test.py"}
        muninn._distill_knowledge(target, success=True)
        
        # Verify content updated
        content = memory_file.read_text(encoding='utf-8')
        assert "- **New**: Something fresh." in content
