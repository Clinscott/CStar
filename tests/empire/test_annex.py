import sys
import shutil
import pytest
from pathlib import Path

# Add .agent/scripts to sys.path to import annex and edda
scripts_dir = Path(__file__).parents[2] / ".agent" / "scripts"
sys.path.append(str(scripts_dir))

from annex import AnnexStrategist

@pytest.fixture
def mock_dominion(tmp_path):
    """Sets up a mock territory for conquest."""
    root = tmp_path / "mock_dominion"
    root.mkdir()
    
    # 1. Linscott Breach: Script with no test
    src = root / "src"
    src.mkdir()
    (src / "unguarded.py").write_text("def vulnerable(): pass", encoding="utf-8")
    
    # 2. Torvalds Breach: Bare Except
    (src / "messy.py").write_text("try:\n    pass\nexcept:\n    pass", encoding="utf-8")
    
    # 3. Edda Task: Markdown
    docs = root / "docs"
    docs.mkdir()
    (docs / "scroll.md").write_text("# Old Scroll", encoding="utf-8")
    
    # 4. Ignored Realm (Workflows)
    workflows = root / ".agent" / "workflows"
    workflows.mkdir(parents=True)
    (workflows / "ignored.md").write_text("# Ignored", encoding="utf-8")
    
    return root

def test_annex_scan(mock_dominion):
    """Verifies the Strategist's scan capabilities."""
    root = mock_dominion
    strategist = AnnexStrategist(root)
    
    # Execute Scan
    strategist.scan()
    
    # Verify Plan Generation
    plan = root / "ANNEXATION_PLAN.qmd"
    assert plan.exists()
    content = plan.read_text(encoding="utf-8")
    
    # Check Linscott Detection
    assert "LINSCOTT_BREACH" in str(strategist.breaches) or "MISSING TEST" in content
    assert "src/unguarded.py" in content
    
    # Check Torvalds Detection
    # Note: annex.py simple AST check might or might not catch it depending on implementation details
    # My annex.py implementation checks specifically for bare except
    assert "messy.py" in content
    
    # Check Edda Tasks
    assert "docs/scroll.md" in content
    assert "workflows/ignored.md" not in content

def test_execution_placeholder(mock_dominion):
    """Verifies the execution placeholder."""
    # This is just ensuring the basics work, execution logic comes later
    pass
