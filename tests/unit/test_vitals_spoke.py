from unittest.mock import patch

import pytest

from src.core.vitals_spoke import get_vitals


ERROR = "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"


def test_get_vitals_fails_before_rpc_or_output() -> None:
    with patch("builtins.print") as output, patch("sqlite3.connect") as sqlite:
        with pytest.raises(RuntimeError, match=f"^{ERROR}$"):
            get_vitals()
    output.assert_not_called()
    sqlite.assert_not_called()
