"""Retirement contract for the legacy Python annexation scanner."""

from unittest.mock import patch

import pytest

from src.core.annex import HeimdallWarden


ERROR = "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"


def test_annex_constructor_fails_before_filesystem_scan() -> None:
    with patch("pathlib.Path.rglob") as recursive_scan:
        with pytest.raises(RuntimeError, match=f"^{ERROR}$"):
            HeimdallWarden("synthetic")
    recursive_scan.assert_not_called()
