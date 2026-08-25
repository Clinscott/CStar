import pytest

from src.core.utils import load_config


def test_persona_loading(tmp_path):
    with pytest.raises(
        RuntimeError,
        match="Direct secret-bearing configuration reads are retired",
    ):
        load_config(str(tmp_path))

    assert list(tmp_path.iterdir()) == []
