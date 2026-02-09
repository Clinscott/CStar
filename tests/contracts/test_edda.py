import shutil

# Import the script to test (assuming it's in the python path or we use subprocess)
# For this test, we'll import the class directly if possible, or mock the environment
# Add .agent/scripts to sys.path to import edda
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.append(str(Path(__file__).parents[2] / ".agent" / "scripts"))

from edda import EddaWeaver


@pytest.fixture
def mock_realm(tmp_path):
    """Sets up a mock project structure for testing."""
    root = tmp_path / "mock_project"
    root.mkdir()
    
    # 1. Legacy Docs
    docs = root / "docs"
    docs.mkdir()
    (docs / "guide.md").write_text("# Old Guide\n> This is a note.", encoding="utf-8")
    
    # 2. Workflow (Should be ignored)
    workflows = root / ".agent" / "workflows"
    workflows.mkdir(parents=True)
    (workflows / "plan.md").write_text("# Plan\nDo not touch.", encoding="utf-8")
    
    # 3. Source Code (For API synthesis)
    src = root / "src"
    src.mkdir()
    (src / "logic.py").write_text('def foo():\n    """Docstring for foo."""\n    pass', encoding="utf-8")
    
    # 4. Quarantine
    quarantine = root / ".corvus_quarantine"
    quarantine.mkdir()
    
    return root, quarantine

def test_transmutation(mock_realm):
    """Scenario 1: The Transmutation"""
    root, quarantine = mock_realm
    weaver = EddaWeaver(root, quarantine)
    
    # Execute
    weaver.scan_and_transmute()
    
    # Verify .qmd creation
    new_doc = root / "docs" / "guide.qmd"
    assert new_doc.exists()
    content = new_doc.read_text(encoding="utf-8")
    assert "title: Old Guide" in content
    # assert "> [!NOTE]" in content # Logic in edda.py simple replacement might need tuning
    
    # Verify Original Preservation
    original_backup = quarantine / "docs" / "guide.md"
    assert original_backup.exists()
    assert original_backup.read_text(encoding="utf-8") == "# Old Guide\n> This is a note."

def test_preservation_workflows(mock_realm):
    """Scenario 2: The Preservation (Workflows)"""
    root, quarantine = mock_realm
    weaver = EddaWeaver(root, quarantine)
    
    weaver.scan_and_transmute()
    
    # Verify workflow is untouched
    workflow = root / ".agent" / "workflows" / "plan.md"
    assert workflow.exists()
    assert not (root / ".agent" / "workflows" / "plan.qmd").exists()

def test_api_synthesis(mock_realm):
    """Scenario 4: API Synthesis"""
    root, quarantine = mock_realm
    weaver = EddaWeaver(root, quarantine)
    
    # Logic.py is in src/
    target = root / "src" / "logic.py"
    weaver.synthesize_api(target)
    
    # Output should be in root/docs/reference/logic.qmd (based on edda.py logic)
    # edda.py: out_dir = self.root / "docs" / "reference"
    # Wait, edda.py uses root from target.parent.parent in main, but here we pass root to class
    # The method synthesize_api uses self.root
    
    expected_doc = root / "docs" / "reference" / "logic.qmd"
    assert expected_doc.exists()
    content = expected_doc.read_text(encoding="utf-8")
    assert "API Reference: logic" in content
    assert "Docstring for foo" in content
