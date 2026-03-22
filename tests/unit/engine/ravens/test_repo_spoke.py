import pytest
import time
from unittest.mock import MagicMock, patch, AsyncMock
from pathlib import Path
from src.core.engine.ravens.repo_spoke import RepoSpoke
from src.core.engine.ravens_stage import RavensCycleResult

@pytest.mark.asyncio
async def test_repo_spoke_process_success():
    repo_path = Path("/tmp/test_repo")
    persona = "ALFRED"
    
    with patch("src.core.engine.ravens.repo_spoke.GitSpoke") as MockGitSpoke, \
         patch("src.core.engine.ravens.repo_spoke.SovereignHUD") as MockHUD, \
         patch("src.core.engine.ravens.repo_spoke.execute_ravens_cycle_contract", new_callable=AsyncMock) as mock_execute, \
         patch.object(Path, "exists", return_value=True):
        
        mock_git = MockGitSpoke.return_value
        mock_git.is_clean.return_value = True
        mock_git.ensure_branch.return_value = "main"
        
        mock_result = RavensCycleResult(status="SUCCESS", metrics={})
        mock_execute.return_value = mock_result
        
        spoke = RepoSpoke(repo_path, persona)
        bootstrap_fn = MagicMock()
        
        success = await spoke.process(bootstrap_fn)
        
        assert success is True
        bootstrap_fn.assert_called_once()
        mock_git.commit_changes.assert_called_once()
        mock_git.restore_branch.assert_called_with("main")

@pytest.mark.asyncio
async def test_repo_spoke_process_dirty_tree():
    repo_path = Path("/tmp/test_repo")
    
    with patch("src.core.engine.ravens.repo_spoke.GitSpoke") as MockGitSpoke, \
         patch("src.core.engine.ravens.repo_spoke.SovereignHUD"), \
         patch.object(Path, "exists", return_value=True):
        
        mock_git = MockGitSpoke.return_value
        mock_git.is_clean.return_value = False
        
        spoke = RepoSpoke(repo_path, "ALFRED")
        success = await spoke.process(MagicMock())
        
        assert success is False
        mock_git.commit_changes.assert_not_called()

@pytest.mark.asyncio
async def test_repo_spoke_process_path_not_found():
    repo_path = Path("/tmp/non_existent")
    
    with patch("src.core.engine.ravens.repo_spoke.GitSpoke"), \
         patch("src.core.engine.ravens.repo_spoke.SovereignHUD"), \
         patch.object(Path, "exists", return_value=False):
        
        spoke = RepoSpoke(repo_path, "ALFRED")
        success = await spoke.process(MagicMock())
        
        assert success is False

@pytest.mark.asyncio
async def test_repo_spoke_process_exception():
    repo_path = Path("/tmp/test_repo")
    
    with patch("src.core.engine.ravens.repo_spoke.GitSpoke") as MockGitSpoke, \
         patch("src.core.engine.ravens.repo_spoke.SovereignHUD"), \
         patch("src.core.engine.ravens.repo_spoke.execute_ravens_cycle_contract", side_effect=Exception("Explosion")), \
         patch.object(Path, "exists", return_value=True):
        
        mock_git = MockGitSpoke.return_value
        mock_git.is_clean.return_value = True
        mock_git.ensure_branch.return_value = "main"
        
        spoke = RepoSpoke(repo_path, "ALFRED")
        success = await spoke.process(MagicMock())
        
        assert success is False
        mock_git.restore_branch.assert_called_with("main")
