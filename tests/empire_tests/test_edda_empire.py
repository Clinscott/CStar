import pytest
from pathlib import Path
from src.core.edda import EddaWeaver

def test_edda_transmute(tmp_path):
    q_dir = tmp_path / "quarantine"
    weaver = EddaWeaver(tmp_path, q_dir)
    
    # Create mock .md file
    md_file = tmp_path / "test.md"
    md_file.write_text("# Test Title\n> Note: This is an alert.", encoding='utf-8')
    
    weaver._transmute(md_file)
    
    qmd_file = tmp_path / "test.qmd"
    assert qmd_file.exists()
    content = qmd_file.read_text(encoding='utf-8')
    assert "title: Test Title" in content
    assert "> [!NOTE]" in content
    assert not md_file.exists() # Should be moved to quarantine
    assert (q_dir / "test.md").exists()
