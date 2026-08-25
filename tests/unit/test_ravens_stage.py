import pytest

from src.core.engine.ravens.muninn_heart import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    MuninnHeart,
)
from src.core.engine.ravens_stage import RavensTargetIdentity


def test_detached_mission_target_parser_remains_available():
    target = MuninnHeart._target_from_mission(
        {"file": "src/example.py", "bead_id": "bead:test", "metrics": {"logic": 1.0}}
    )
    assert isinstance(target, RavensTargetIdentity)
    assert target.target_path == "src/example.py"
    assert target.bead_id == "bead:test"


def test_muninn_heart_is_retired_before_cycle_state():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        MuninnHeart("synthetic", object())
