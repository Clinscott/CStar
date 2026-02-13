import pytest
from pathlib import Path
from src.core.annex import HeimdallWarden

def test_annex_scan(tmp_path):
    # Create mock project structure
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "test.py").write_text("print('no test')", encoding='utf-8')
    
    warden = HeimdallWarden(tmp_path)
    warden.scan()
    
    # Check if a breach was found (test.py missing test_test.py)
    # The scan results are stored in warden.breaches
    assert len(warden.breaches) > 0
    assert any("test.py" in str(b) for b in warden.breaches)
