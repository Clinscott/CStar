"""Retirement contract for the legacy Python documentation transmuter."""

from unittest.mock import patch

import pytest

from src.core.edda import EddaWeaver


ERROR = "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"


def test_edda_constructor_fails_before_filesystem_mutation() -> None:
    with patch("pathlib.Path.write_text") as write_text:
        with pytest.raises(RuntimeError, match=f"^{ERROR}$"):
            EddaWeaver("synthetic", "synthetic")
    write_text.assert_not_called()
