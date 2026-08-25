import pytest

from src.core.engine.ravens.repo_spoke import LEGACY_PYTHON_RAVENS_ENGINE_ERROR, RepoSpoke


def test_repo_spoke_is_retired_before_callback_or_git():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        RepoSpoke("synthetic", "ALFRED")
