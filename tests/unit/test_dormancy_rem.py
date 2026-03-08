import pytest
import asyncio
import json
from unittest.mock import patch, MagicMock, AsyncMock
from src.skills.local.dormancy import consolidated_memory


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
