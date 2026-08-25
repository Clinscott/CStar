import pytest

from src.core.lease_manager import LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR, LeaseManager


def test_direct_sqlite_lease_manager_is_retired():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        LeaseManager("synthetic")
