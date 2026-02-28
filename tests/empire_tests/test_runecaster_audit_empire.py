import sys
from pathlib import Path

import pytest

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.wardens.runecaster import RuneCasterWarden
class TestRuneCasterWarden:
    @pytest.fixture
    def warden(self, tmp_path):
        return RuneCasterWarden(tmp_path)

    def test_scan_finds_missing_return_type(self, tmp_path, warden):
        py_path = tmp_path / "logic.py"
        py_path.write_text("def foo(x: int):\n    pass", encoding='utf-8')

        results = warden.scan()
        assert len(results) == 1
        assert "foo" in results[0]['action']

    def test_scan_finds_missing_arg_type(self, tmp_path, warden):
        py_path = tmp_path / "logic.py"
        py_path.write_text("def foo(x) -> int:\n    pass", encoding='utf-8')

        results = warden.scan()
        assert len(results) == 1
        assert "foo" in results[0]['action']

    def test_scan_ignores_complete_hints(self, tmp_path, warden):
        py_path = tmp_path / "logic.py"
        py_path.write_text("def foo(x: int) -> int:\n    pass", encoding='utf-8')

        results = warden.scan()
        assert len(results) == 0

    def test_scan_ignores_self(self, tmp_path, warden):
        py_path = tmp_path / "logic.py"
        py_path.write_text("class A:\n    def foo(self) -> None:\n        pass", encoding='utf-8')

        results = warden.scan()
        assert len(results) == 0
