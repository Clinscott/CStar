import pytest

from src.core.engine.ravens.muninn import LEGACY_PYTHON_RAVENS_ENGINE_ERROR, Muninn


def test_muninn_facade_fails_before_secret_or_provider_access():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        Muninn("synthetic")
