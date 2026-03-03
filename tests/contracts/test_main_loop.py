"""
Main Loop Contract Tests (v5.0)
Verifies: DaemonOrchestrator, RepoSpoke.
All tests use mocked git/muninn — zero side effects.
"""
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.sentinel.main_loop import DaemonOrchestrator
from src.sentinel.repo_spoke import RepoSpoke


class TestRepoSpokeSkipsDirty:
    """Dirty working tree -> returns False, no commit."""

    @patch("src.sentinel.muninn.Muninn")
    @patch("src.sentinel.repo_spoke.GitSpoke")
    def test_dirty_repo_returns_false(self, mock_git_cls, mock_muninn_cls, tmp_path):
        mock_git = MagicMock()
        mock_git.is_clean.return_value = False
        mock_git_cls.return_value = mock_git
        
        spoke = RepoSpoke(tmp_path, "ODIN")
        # We need a mock for the bootstrap_fn
        mock_bootstrap = MagicMock()
        
        # RepoSpoke.process is async
        import asyncio
        result = asyncio.run(spoke.process(mock_bootstrap))
        
        assert result is False
        mock_muninn_cls.assert_not_called()


class TestRepoSpokeCommitsOnChange:
    """Muninn.run_cycle() returns True -> git.commit_changes called."""

    @patch("src.sentinel.muninn.Muninn")
    @patch("src.sentinel.repo_spoke.GitSpoke")
    def test_commit_on_change(self, mock_git_cls, mock_muninn_cls, tmp_path):
        mock_git = MagicMock()
        mock_git.is_clean.return_value = True
        mock_git.ensure_branch.return_value = "main"
        mock_git_cls.return_value = mock_git
        
        mock_muninn = MagicMock()
        mock_muninn.run_cycle = AsyncMock(return_value=True)
        mock_muninn_cls.return_value = mock_muninn
        
        spoke = RepoSpoke(tmp_path, "ODIN")
        mock_bootstrap = MagicMock()
        
        import asyncio
        result = asyncio.run(spoke.process(mock_bootstrap))

        assert result is True
        mock_git.commit_changes.assert_called()

    @patch("src.sentinel.muninn.Muninn")
    @patch("src.sentinel.repo_spoke.GitSpoke")
    def test_no_commit_when_no_change(self, mock_git_cls, mock_muninn_cls, tmp_path):
        mock_git = MagicMock()
        mock_git.is_clean.return_value = True
        mock_git.ensure_branch.return_value = "main"
        mock_git_cls.return_value = mock_git
        
        mock_muninn = MagicMock()
        mock_muninn.run_cycle = AsyncMock(return_value=False)
        mock_muninn_cls.return_value = mock_muninn
        
        spoke = RepoSpoke(tmp_path, "ODIN")
        mock_bootstrap = MagicMock()
        
        import asyncio
        result = asyncio.run(spoke.process(mock_bootstrap))

        assert result is False
        mock_git.commit_changes.assert_not_called()




class TestDaemonOrchestrator:
    """Verifies configuration loading logic."""

    @patch("src.sentinel.main_loop.SovereignUtils.safe_read_json")
    def test_load_persona_defaults_to_odin(self, mock_read):
        mock_read.return_value = {}
        result = DaemonOrchestrator.load_persona()
        assert result == "ODIN"

    @patch("src.sentinel.main_loop.SovereignUtils.safe_read_json")
    def test_load_persona_from_config(self, mock_read):
        mock_read.return_value = {"persona": "ALFRED"}
        result = DaemonOrchestrator.load_persona()
        assert result == "ALFRED"

    @patch("src.sentinel.main_loop.SovereignUtils.safe_read_json")
    def test_load_target_repos_defaults_to_root(self, mock_read):
        mock_read.return_value = {}
        repos = DaemonOrchestrator.load_target_repos()
        assert len(repos) == 1
        # Should contain the PROJECT_ROOT
        from src.sentinel._bootstrap import PROJECT_ROOT
        assert str(PROJECT_ROOT) in repos[0]
