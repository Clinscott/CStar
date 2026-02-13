import pytest
from pathlib import Path
import sys

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.muninn import EddaWarden

class TestEddaWarden:
    @pytest.fixture
    def warden(self, tmp_path):
        return EddaWarden(tmp_path)

    def test_scan_finds_missing_docstring_function(self, tmp_path, warden):
        py_path = tmp_path / "logic.py"
        py_path.write_text("def foo():\n    pass", encoding='utf-8')
        
        results = warden.scan()
        assert len(results) == 1
        assert "foo" in results[0]['action']

    def test_scan_finds_missing_docstring_class(self, tmp_path, warden):
        py_path = tmp_path / "logic.py"
        py_path.write_text("class Foo:\n    pass", encoding='utf-8')
        
        results = warden.scan()
        assert len(results) == 1
        assert "Foo" in results[0]['action']

    def test_scan_ignores_existing_docstring(self, tmp_path, warden):
        py_path = tmp_path / "logic.py"
        py_path.write_text('def foo():\n    """Doc."""\n    pass', encoding='utf-8')
        
        results = warden.scan()
        assert len(results) == 0
