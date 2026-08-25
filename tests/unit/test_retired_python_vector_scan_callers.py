from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import pytest

from src.tools.data.overfit_corrections import CorrectionOptimizer, overfit
from src.tools.debug.collision_investigator import CollisionInvestigator
from src.tools.debug.debug_engine import DebugEngine, debug_query
from src.tools.debug.debug_fishtest import (
    FishtestLegacyDiagnostic,
    run_debug_fishtest,
)
from src.tools.debug.debug_fishtest_phase2 import FishtestDiagnostic, run_debug_phase2
from src.tools.debug.debug_perf import PerformanceProfiler, run_profile
from src.tools.debug.diag_engine import DiagnosticEngine, run_diag
from src.tools.trace_viz import TraceVisualizer
from src.tools.tune_weights import MetaLearner, WeightTuner


VECTOR_CALLER_ERROR = "legacy_python_vector_scan_caller_retired_use_cstar_validation"
WEIGHT_TUNER_ERROR = "legacy_python_weight_tuner_effect_retired_use_cstar_validation"


@pytest.mark.parametrize(
    "invoke",
    [
        run_debug_fishtest,
        FishtestLegacyDiagnostic.execute,
        run_debug_phase2,
        FishtestDiagnostic.execute,
        run_profile,
        PerformanceProfiler.execute,
        run_diag,
        DiagnosticEngine.execute,
        CollisionInvestigator.execute,
        CorrectionOptimizer.execute,
        overfit,
        lambda: DebugEngine.execute("query"),
        lambda: debug_query("query"),
        TraceVisualizer.get_engine,
    ],
)
def test_vector_scan_callers_fail_before_effects(invoke) -> None:
    with ExitStack() as stack:
        probes = [
            stack.enter_context(patch(target))
            for target in (
                "builtins.open",
                "pathlib.Path.exists",
                "pathlib.Path.open",
                "pathlib.Path.read_text",
                "pathlib.Path.write_text",
                "pathlib.Path.glob",
                "pathlib.Path.rglob",
                "pathlib.Path.stat",
                "subprocess.run",
                "sqlite3.connect",
                "socket.socket",
                "os.system",
            )
        ]
        with pytest.raises(RuntimeError, match=f"^{VECTOR_CALLER_ERROR}$"):
            invoke()

    for probe in probes:
        probe.assert_not_called()


@pytest.mark.parametrize(
    "invoke",
    [
        lambda: WeightTuner.execute("/synthetic/root"),
        lambda: MetaLearner(MagicMock()).apply_updates("/synthetic/thesaurus.qmd"),
    ],
)
def test_weight_tuner_actions_fail_before_effects(invoke) -> None:
    with (
        patch("builtins.open") as mock_open,
        patch("pathlib.Path.exists") as mock_exists,
        patch("pathlib.Path.write_text") as mock_write_text,
    ):
        with pytest.raises(RuntimeError, match=f"^{WEIGHT_TUNER_ERROR}$"):
            invoke()

    mock_open.assert_not_called()
    mock_exists.assert_not_called()
    mock_write_text.assert_not_called()


def test_vector_scan_callers_do_not_import_or_construct_vector_runtime() -> None:
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    sources = [
        "src/tools/debug/debug_fishtest.py",
        "src/tools/debug/debug_fishtest_phase2.py",
        "src/tools/debug/debug_perf.py",
        "src/tools/debug/diag_engine.py",
        "src/tools/debug/collision_investigator.py",
        "src/tools/data/overfit_corrections.py",
        "src/tools/debug/debug_engine.py",
    ]
    for relative in sources:
        source = (root / relative).read_text(encoding="utf-8")
        for token in (
            "SovereignVector",
            "load_skills_from_dir",
            "sys.path",
            "open(",
            ".exists(",
        ):
            assert token not in source, (relative, token)

    trace_source = (root / "src/tools/trace_viz.py").read_text(encoding="utf-8")
    assert "SovereignVector" not in trace_source
    assert "load_skills_from_dir" not in trace_source

    tuner_source = (root / "src/tools/tune_weights.py").read_text(encoding="utf-8")
    assert "SovereignVector" not in tuner_source
    assert "load_skills_from_dir" not in tuner_source
    assert "open(" not in tuner_source
