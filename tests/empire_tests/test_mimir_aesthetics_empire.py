import sys
from pathlib import Path

import pytest

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.wardens.mimir import MimirWarden


class TestMimirBeauty:
    @pytest.fixture
    def warden(self, tmp_path):
        return MimirWarden(tmp_path)

    def test_claustrophobic_code_breach(self, tmp_path, warden):
        # Create a file with > 12 lines of consecutive logic
        code = "def dense_function():\n" + "\n".join([f"    x_{i} = {i}" for i in range(15)])
        py_file = tmp_path / "dense.py"
        py_file.write_text(code, encoding='utf-8')

        results = warden.scan()
        assert any(r['type'] == "MIMIR_AESTHETIC_BREACH" for r in results)

    def test_top_heavy_function_breach(self, tmp_path, warden):
        # Setup nodes (assignments) vs Exec nodes (return)
        # Ratio will be 4/1 = 4.0 (> 1.7)
        code = """
def top_heavy():
    a = 1
    b = 2
    c = 3
    d = 4
    return a + b + c + d
"""
        py_file = tmp_path / "top_heavy.py"
        py_file.write_text(code, encoding='utf-8')

        results = warden.scan()
        assert any(r['type'] == "MIMIR_STRUCTURAL_BREACH" for r in results)

    def test_structural_beauty_pass(self, tmp_path, warden):
        code = """
def beautiful_function():
    # Setup
    data = {"v": 1}
    
    # Execution Breathes
    if not data:
        return None
        
    return data.get("v")
"""
        py_file = tmp_path / "beautiful.py"
        py_file.write_text(code, encoding='utf-8')

        results = warden.scan()
        # Should not find aesthetic or structural breaches
        assert not any(r['type'] in ("MIMIR_AESTHETIC_BREACH", "MIMIR_STRUCTURAL_BREACH") for r in results)
