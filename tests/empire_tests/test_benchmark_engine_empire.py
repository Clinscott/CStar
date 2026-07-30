import pytest

from src.tools import benchmark_engine


def test_engine_benchmark_is_retired() -> None:
    with pytest.raises(RuntimeError, match=f"^{benchmark_engine.RETIREMENT_ERROR}$"):
        benchmark_engine.benchmark(n=3)


def test_engine_benchmark_orchestrator_is_retired() -> None:
    with pytest.raises(RuntimeError, match=f"^{benchmark_engine.RETIREMENT_ERROR}$"):
        benchmark_engine.BenchmarkOrchestrator.execute(3)
