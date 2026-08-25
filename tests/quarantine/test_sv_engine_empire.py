import pytest

from src.core import sv_engine


def test_quarantined_engine_expectations_match_retirement_boundary() -> None:
    with pytest.raises(RuntimeError, match=f"^{sv_engine.RETIREMENT_ERROR}$"):
        sv_engine.SovereignEngine(project_root="synthetic")


def test_quarantined_engine_main_matches_retirement_boundary() -> None:
    with pytest.raises(RuntimeError, match=f"^{sv_engine.RETIREMENT_ERROR}$"):
        sv_engine.main()
