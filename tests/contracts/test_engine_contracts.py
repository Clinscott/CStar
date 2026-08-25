"""Contract test for the retired Sovereign Engine entrypoint."""

import pytest

from src.core.sv_engine import RETIREMENT_ERROR, SovereignEngine, main


def test_sovereign_engine_fails_closed_with_stable_migration_error() -> None:
    for invoke in (SovereignEngine, main):
        with pytest.raises(RuntimeError, match=f"^{RETIREMENT_ERROR}$"):
            invoke()
