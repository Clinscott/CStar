import pytest
import os
from pathlib import Path
from src.tools.debt_viz import DebtAnalyzer

def test_debt_analyzer_files(tmp_path):
    # Setup mock project
    src = tmp_path / "src"
    src.mkdir()
    (src / "main.py").write_text("def a(): pass", encoding='utf-8')
    (src / "utils.py").write_text("def b(): pass", encoding='utf-8')
    
    # Ignored dir
    venv = tmp_path / ".venv"
    venv.mkdir()
    (venv / "lib.py").write_text("pass", encoding='utf-8')
    
    analyzer = DebtAnalyzer(str(tmp_path))
    analyzer._get_python_files()
    
    # Should only find main.py and utils.py
    assert len(analyzer.files) == 2
    filenames = [f.name for f in analyzer.files]
    assert "main.py" in filenames
    assert "utils.py" in filenames
    assert "lib.py" not in filenames

def test_debt_analyzer_logic(tmp_path):
    f = tmp_path / "complex.py"
    # A bit of complexity: nested loops and conditionals
    f.write_text("""
def complex_func(x):
    if x > 0:
        for i in range(10):
            if i % 2 == 0:
                print(i)
    else:
        return None
""", encoding='utf-8')
    
    analyzer = DebtAnalyzer(str(tmp_path))
    success = analyzer.analyze(log_errors=False)
    
    assert success is True
    assert len(analyzer.blocks) == 1
    assert analyzer.blocks[0]["name"] == "complex_func"
    assert analyzer.blocks[0]["cc"] > 1
