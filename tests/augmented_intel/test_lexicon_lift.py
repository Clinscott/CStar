import pytest

from src.core import sv_engine


def test_retired_engine_cannot_trigger_proactive_lexicon_activity() -> None:
    with pytest.raises(RuntimeError, match=f"^{sv_engine.RETIREMENT_ERROR}$"):
        sv_engine.SovereignEngine()
