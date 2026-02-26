import pytest
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.muninn import Muninn

import json

class TestMuninnMemoryIdempotency:
    @pytest.fixture
    def mock_muninn(self, tmp_path):
        # Setup mock memory.qmd (legacy but fine)
        memory_file = tmp_path / "memory.qmd"
        memory_file.write_text("## Lessons Learned\n- **Existing**: This exists.\n", encoding='utf-8')
        
        # Mock client
        mock_client = MagicMock()
        
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key", "MUNINN_API_KEY": ""}):
            # Initialize Muninn with tmp path
            muninn = Muninn(str(tmp_path), client=mock_client)
            return muninn, memory_file, mock_client

    def test_distill_knowledge_creates_directives(self, mock_muninn, tmp_path):
        muninn, _, _ = mock_muninn
        
        # Setup mock ledger
        ledger_dir = tmp_path / ".agent"
        ledger_dir.mkdir(exist_ok=True)
        ledger_path = ledger_dir / "ledger.json"
        
        ledger_data = {
            "global_project_health_score": 95.5,
            "flight_history": [
                {"target": "cursed.py", "decision": "Reject", "timestamp": "2023-01-01"},
                {"target": "cursed.py", "decision": "Reject", "timestamp": "2023-01-02"},
                {"target": "cursed.py", "decision": "Reject", "timestamp": "2023-01-03"}, # 3 rejects = 100% fail rate
                {"target": "blessed.py", "decision": "Accept", "alignment_score": 99, "timestamp": "2023-01-04"},
                {"target": "ok.py", "decision": "Accept", "alignment_score": 80, "timestamp": "2023-01-05"}
            ]
        }
        ledger_path.write_text(json.dumps(ledger_data), encoding='utf-8')

        # Run distillation
        muninn._distill_knowledge()
        
        # Verify output
        directives_path = ledger_dir / "cortex_directives.md"
        assert directives_path.exists()
        content = directives_path.read_text(encoding='utf-8')
        
        assert "Global Project Health Score: 95.50" in content
        assert "cursed.py" in content
        assert "blessed.py" in content

