import pytest

from src.tools import latency_check


def test_engine_latency_profiler_is_retired() -> None:
    with pytest.raises(RuntimeError, match=f"^{latency_check.RETIREMENT_ERROR}$"):
        latency_check.LatencyProfiler(iterations=2)


def test_engine_latency_profiler_main_is_retired() -> None:
    with pytest.raises(RuntimeError, match=f"^{latency_check.RETIREMENT_ERROR}$"):
        latency_check.main()
