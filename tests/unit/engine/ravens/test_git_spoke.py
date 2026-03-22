import pytest
import subprocess
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.ravens.git_spoke import GitSpoke

@pytest.fixture
def git_spoke():
    return GitSpoke(Path("/tmp/test_repo"))

def test_run_cmd_success(git_spoke):
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout="  output  ", check=True)
        result = git_spoke.run_cmd(["status"])
        assert result == "output"
        mock_run.assert_called_once()

def test_run_cmd_failure(git_spoke):
    with patch("subprocess.run") as mock_run:
        mock_run.side_effect = subprocess.CalledProcessError(1, "git")
        result = git_spoke.run_cmd(["status"])
        assert result is None

def test_is_clean(git_spoke):
    with patch.object(git_spoke, "run_cmd") as mock_run:
        mock_run.return_value = ""
        assert git_spoke.is_clean() is True
        
        mock_run.return_value = " M file.py"
        assert git_spoke.is_clean() is False

def test_ensure_branch(git_spoke):
    with patch.object(git_spoke, "run_cmd") as mock_run:
        mock_run.side_effect = ["main", "", None, None]
        
        original = git_spoke.ensure_branch("sovereign-fish-auto")
        assert original == "main"
        
        # Called check branch name, then checkout -b because it's missing
        assert mock_run.call_count == 3
        mock_run.assert_any_call(["branch", "--list", "sovereign-fish-auto"])
        mock_run.assert_any_call(["checkout", "-b", "sovereign-fish-auto"])

def test_restore_branch(git_spoke):
    with patch.object(git_spoke, "run_cmd") as mock_run:
        git_spoke.restore_branch("main")
        mock_run.assert_called_with(["checkout", "main"])
        
        git_spoke.restore_branch(None)
        mock_run.assert_called_once() # No second call

def test_commit_changes(git_spoke):
    with patch.object(git_spoke, "run_cmd") as mock_run:
        git_spoke.commit_changes("Fix things")
        mock_run.assert_any_call(["add", "-A"])
        mock_run.assert_any_call(["commit", "-m", "Fix things"])
