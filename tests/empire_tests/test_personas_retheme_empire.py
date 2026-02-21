import os
import shutil
from pathlib import Path
from src.core.personas import OdinStrategy

def test_odin_retheme_docs_creates_dir(tmp_path):
    # Setup mock structure
    root = tmp_path
    sterile = root / "sterileAgent"
    sterile.mkdir()
    template = sterile / "AGENTS_ODIN.qmd"
    template.write_text("ODIN TEMPLATE", encoding="utf-8")
    
    strategy = OdinStrategy(str(root))
    
    results = strategy.retheme_docs()
    
    # Verify file was created at root
    assert (root / "AGENTS.qmd").exists()
    assert "RE-THEMED" in results[0]

if __name__ == "__main__":
    # Simple manual check or running via pytest
    import pytest
    pytest.main([__file__])
