from pathlib import Path

import pytest

from src.core.engine.ravens.muninn_promotion import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    MuninnPromotion,
)


def test_promotion_backup_path_helper_is_detached():
    assert MuninnPromotion._backup_path(Path("target.py")) == Path("target.py.bak")


@pytest.mark.parametrize(
    "method", ["_rollback_file", "_clear_backup", "_block_bead", "execute_promotion_stage"]
)
def test_promotion_actions_fail_before_lifecycle_or_files(method):
    promotion = object.__new__(MuninnPromotion)
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        getattr(promotion, method)()
