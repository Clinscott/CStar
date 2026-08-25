import pytest

from src.core.engine.ravens.git_spoke import LEGACY_PYTHON_RAVENS_ENGINE_ERROR, GitSpoke


@pytest.mark.parametrize(
    "method", ["run_cmd", "is_clean", "ensure_branch", "restore_branch", "commit_changes"]
)
def test_git_spoke_methods_fail_before_git(method):
    spoke = object.__new__(GitSpoke)
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        getattr(spoke, method)([])
