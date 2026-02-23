
import pytest
from pathlib import Path
import sys

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.wardens.runecaster import RuneCasterWarden

class TestRuneCasterEmpire:
    
    @pytest.fixture
    def mock_root(self, tmp_path):
        return tmp_path

    def test_scan_perfect_file(self, mock_root):
        """Test a file with perfect type hints."""
        py_file = mock_root / "perfect.py"
        py_file.write_text("def foo(x: int) -> int:\n    return x\n\nclass Bar:\n    def __init__(self) -> None:\n        pass\n", encoding='utf-8')
        
        warden = RuneCasterWarden(mock_root)
        results = warden.scan()
        assert len(results) == 0

    def test_scan_missing_args(self, mock_root):
        """Test detection of missing argument hints."""
        py_file = mock_root / "missing_arg.py"
        py_file.write_text("def foo(x) -> int:\n    return int(x)\n", encoding='utf-8')
        
        warden = RuneCasterWarden(mock_root)
        results = warden.scan()
        
        breach = next((b for b in results if b["type"] == "RUNE_MISSING_ARGS"), None)
        assert breach is not None
        assert "Cast Runes" in breach["action"]

    def test_scan_missing_return(self, mock_root):
        """Test detection of missing return hints."""
        py_file = mock_root / "missing_return.py"
        py_file.write_text("def foo(x: int):\n    return x\n", encoding='utf-8')
        
        warden = RuneCasterWarden(mock_root)
        results = warden.scan()
        
        breach = next((b for b in results if b["type"] == "RUNE_MISSING_RET"), None)
        assert breach is not None

    def test_scan_strict_init(self, mock_root):
        """Test detection of missing return hint on __init__."""
        py_file = mock_root / "strict_init.py"
        py_file.write_text("class Foo:\n    def __init__(self):\n        pass\n", encoding='utf-8')
        
        warden = RuneCasterWarden(mock_root)
        results = warden.scan()
        
        breach = next((b for b in results if b["type"] == "RUNE_STRICT_INIT"), None)
        assert breach is not None
        assert "__init__ must return -> None" in breach["action"]

    def test_scan_weak_generics(self, mock_root):
        """Test detection of raw generic types."""
        py_file = mock_root / "weak_generic.py"
        py_file.write_text("def process_items(items: list) -> None:\n    pass\n", encoding='utf-8')
        
        warden = RuneCasterWarden(mock_root)
        results = warden.scan()
        
        breach = next((b for b in results if b["type"] == "RUNE_WEAK_GENERIC"), None)
        assert breach is not None
        assert "Strengthen Rune" in breach["action"]

if __name__ == "__main__":
    pytest.main([__file__])
