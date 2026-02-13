import pytest
from pathlib import Path
from scripts.fix_muninn import standardize_muninn

def test_standardize_muninn(tmp_path):
    # Mock a Muninn file with the old RuneCasterWarden
    test_file = tmp_path / "muninn_mock.py"
    test_file.write_text("\n".join([
        "class RuneCasterWarden:",
        "    def scan(self):",
        "        pass",
        "",
        "class MimirWarden:",
        "    pass",
        "",
        "if True:",
        " " * 21 + "if True:",
        " " * 25 + "pass"
    ]), encoding='utf-8')
    
    standardize_muninn(test_file)
    
    content = test_file.read_text(encoding='utf-8')
    
    assert "[TYPE SAFETY]" in content
    assert "import ast" in content
    assert "RUNE_BREACH" in content
    
    # Check for the specific space replacement: 21 spaces -> 20 spaces
    assert " " * 21 + "if" not in content
    assert " " * 20 + "if" in content
