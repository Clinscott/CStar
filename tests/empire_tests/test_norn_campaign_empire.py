import pytest
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.muninn import NornWarden

class TestNornWarden:
    @pytest.fixture
    def plan_file(self, tmp_path):
        plan_dir = tmp_path / ".agent"
        plan_dir.mkdir(parents=True)
        plan_path = plan_dir / "CAMPAIGN_IMPLEMENTATION_PLAN.qmd"
        content = """---
title: Campaign
---

| ID | File | Target | Type | Description |
|---|---|---|---|---|
| 1 | `src/foo.py` | Foo | FIX | Fix the thing |
| 2 | `src/bar.py` | Bar | NEW | Create the bar |
"""
        plan_path.write_text(content, encoding='utf-8')
        return plan_path

    def test_get_next_target(self, tmp_path, plan_file):
        warden = NornWarden(tmp_path)
        target = warden.get_next_target()
        
        assert target is not None
        assert target['file'] == "src/foo.py"
        assert "Fix the thing" in target['action']
        assert target['line_index'] == 6 # 0-indexed line with the first task

    def test_mark_complete(self, tmp_path, plan_file):
        warden = NornWarden(tmp_path)
        target = {
            'file': 'src/foo.py',
            'action': '[FIX] Fix the thing',
            'line_index': 6
        }
        warden.mark_complete(target)
        
        content = plan_file.read_text(encoding='utf-8')
        assert "~~Fix the thing~~" in content
        assert "~~`src/foo.py`~~" in content # Strike through everything
