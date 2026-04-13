import pytest
import asyncio
import json
from unittest.mock import patch, MagicMock, AsyncMock
from src.skills.local.dormancy import consolidated_memory
from src.core.engine.bead_ledger import BeadLedger


@pytest.fixture
def mock_mimir():
    with patch("src.skills.local.dormancy.mimir") as mock:
        mock.close = AsyncMock()
        mock.index_sector = AsyncMock()
        yield mock


@pytest.mark.asyncio
async def test_consolidated_memory_no_debt(mock_mimir, tmp_path):
    # Setup mock response for no debt
    mock_res = MagicMock()
    mock_res.isError = False
    mock_res.content = [MagicMock(text='[ALFRED]: "The repository logic is currently within nominal parameters, sir."')]
    mock_mimir.call_tool = AsyncMock(return_value=mock_res)
    
    with patch("src.skills.local.dormancy.project_root", tmp_path):
        # Create .agent dir
        (tmp_path / ".agents").mkdir()
        
        await consolidated_memory()
        
        # Verify long-term memory was written
        memory_file = tmp_path / ".agents" / "memory.qmd"
        assert memory_file.exists()
        content = memory_file.read_text(encoding="utf-8")
        assert "No autonomous repairs required" in content
        session_files = list((tmp_path / ".agents" / "memory").glob("session_*.json"))
        assert len(session_files) == 1
        session_events = json.loads(session_files[0].read_text(encoding="utf-8"))
        assert session_events[0]["cmd"] == "session_learned"
        assert session_events[0]["metadata"]["learning_scope"] == ["cstar", "persona"]
        
        # Verify mimir was closed
        mock_mimir.close.assert_called_once()


@pytest.mark.asyncio
async def test_consolidated_memory_with_debt(mock_mimir, tmp_path):
    # Setup mock response for technical debt
    debt_text = """
[ALFRED]: "Current Technical Debt Ledger:"
- **src/core/test1.py** (HIGH) | Target: STYLE: Aesthetic Dissonance
- **src/core/test2.py** (CRITICAL) | Target: LOGIC: Atomic Alert
    """
    mock_debt_res = MagicMock()
    mock_debt_res.isError = False
    mock_debt_res.content = [MagicMock(text=debt_text)]
    
    # Setup mock response for workflow
    mock_workflow_res = MagicMock()
    mock_workflow_res.isError = False
    
    # Define side effect to return debt then workflow results
    async def call_tool_side_effect(server, tool, args=None):
        if tool == "get_technical_debt":
            return mock_debt_res
        elif tool == "run_workflow":
            return mock_workflow_res
            
    mock_mimir.call_tool = AsyncMock(side_effect=call_tool_side_effect)
    
    with patch("src.skills.local.dormancy.project_root", tmp_path):
        (tmp_path / ".agents").mkdir()
        
        await consolidated_memory()
        
        # Verify workflow was called for the targets
        assert mock_mimir.call_tool.call_count == 3 # 1 debt + 2 workflows
        
        # Verify index_sector was called after fixes
        assert mock_mimir.index_sector.call_count == 2
        mock_mimir.index_sector.assert_any_call("src/core/test1.py")
        mock_mimir.index_sector.assert_any_call("src/core/test2.py")
        
        # Verify memory output
        memory_file = tmp_path / ".agents" / "memory.qmd"
        content = memory_file.read_text(encoding="utf-8")
        assert "Sanitized 2 sectors" in content
        assert "src/core/test1.py (STYLE)" in content


@pytest.mark.asyncio
async def test_consolidated_memory_projects_weak_sectors_into_sovereign_beads(mock_mimir, tmp_path):
    mock_res = MagicMock()
    mock_res.isError = False
    mock_res.content = [MagicMock(text='[ALFRED]: "No debt beyond the dream cycle, sir."')]
    mock_mimir.call_tool = AsyncMock(return_value=mock_res)

    search_script = tmp_path / ".agents" / "skills" / "qmd_search" / "scripts"
    search_script.mkdir(parents=True)
    (search_script / "search.py").write_text("# projection stub\n", encoding="utf-8")
    (tmp_path / ".agents").mkdir(exist_ok=True)

    weak_sector_payload = json.dumps(
        [
            {
                "path": "src/core/weak.py",
                "scores": {"overall": 2.5, "logic": 2.0, "style": 4.0, "intel": 5.0},
            }
        ]
    )

    completed = MagicMock()
    completed.returncode = 0
    completed.stdout = weak_sector_payload

    with patch("src.skills.local.dormancy.project_root", tmp_path), patch("subprocess.run", return_value=completed):
        await consolidated_memory()

    beads = BeadLedger(tmp_path).list_beads()
    assert len(beads) == 1
    assert beads[0].target_path == "src/core/weak.py"
    assert beads[0].baseline_scores["overall"] == 2.5
