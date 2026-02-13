import pytest
from pathlib import Path
from src.tools.code_sentinel import Heimdall

def test_heimdall_scan_orphans(tmp_path):
    # Create a test file with an orphan function
    test_file = tmp_path / "orphan_test.py"
    test_file.write_text("def my_orphan():\n    pass\n", encoding='utf-8')
    
    # Run Heimdall on the file
    heimdall = Heimdall(target=str(test_file), persona_override="ODIN")
    violations = heimdall.scan_for_orphans(test_file)
    
    assert len(violations) == 1
    assert "Orphaned Function 'my_orphan'" in violations[0]["message"]
    assert violations[0]["code"] == "STRUCT-001"

def test_heimdall_ignore_main(tmp_path):
    test_file = tmp_path / "main_test.py"
    test_file.write_text("def main():\n    pass\n", encoding='utf-8')
    
    heimdall = Heimdall(target=str(test_file))
    violations = heimdall.scan_for_orphans(test_file)
    assert len(violations) == 0
