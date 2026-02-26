import sys
from pathlib import Path

import pytest

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.muninn import NornWarden


class TestNornWarden:
    @pytest.fixture
    def plan_file(self, tmp_path):
        plan_path = tmp_path / "tasks.qmd"
        content = """---
title: Tasks
---

- [ ] Fix the thing
- [x] Create the bar
"""
        plan_path.write_text(content, encoding='utf-8')
        return plan_path

    def test_get_next_target(self, tmp_path, plan_file):
        warden = NornWarden(tmp_path)
        target = warden.get_next_target()

        assert target is not None
        assert target['file'] == "tasks.qmd"
        assert "Fix the thing" in target['action']
        assert target['line_index'] == 4

    def test_mark_complete(self, tmp_path, plan_file):
        warden = NornWarden(tmp_path)
        target = {
            'file': 'tasks.qmd',
            'action': 'Fix the thing',
            'line_index': 4
        }
        warden.mark_complete(target)

        content = plan_file.read_text(encoding='utf-8')
        assert "- [x] Fix the thing" in content

