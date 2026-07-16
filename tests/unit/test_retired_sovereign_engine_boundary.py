"""Fail-closed and zero-side-effect proof for retired sovereign entrypoints."""

from __future__ import annotations

import ast
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from src.core import sv_engine
from src.tools import benchmark_engine, latency_check, loop, wrap_it_up
from src.tools.debug import audit_dialogue


ROOT = Path(__file__).resolve().parents[2]
ENGINE_ERROR = "legacy_sovereign_engine_retired_use_cstar_kernel"
WRAP_ERROR = "legacy_wrap_it_up_retired_use_cstar_closeout"
TOMBSTONES = (
    "src/core/sv_engine.py",
    "src/tools/wrap_it_up.py",
    "src/tools/loop.py",
    "src/tools/debug/audit_dialogue.py",
    "src/tools/benchmark_engine.py",
    "src/tools/latency_check.py",
)


@pytest.mark.parametrize(
    ("invoke", "expected_error"),
    (
        (sv_engine.SovereignEngine, ENGINE_ERROR),
        (sv_engine.main, ENGINE_ERROR),
        (wrap_it_up.SovereignWrapper, WRAP_ERROR),
        (wrap_it_up.main, WRAP_ERROR),
        (loop.SovereignForge, WRAP_ERROR),
        (loop.SovereignLifecycle.execute, WRAP_ERROR),
        (loop.main, WRAP_ERROR),
        (audit_dialogue.DialogueAuditor, ENGINE_ERROR),
        (audit_dialogue.main, ENGINE_ERROR),
        (benchmark_engine.benchmark, ENGINE_ERROR),
        (benchmark_engine.BenchmarkOrchestrator.execute, ENGINE_ERROR),
        (benchmark_engine.main, ENGINE_ERROR),
        (latency_check.LatencyProfiler, ENGINE_ERROR),
        (latency_check.main, ENGINE_ERROR),
    ),
)
def test_retired_entrypoints_return_only_the_stable_error(
    invoke: object,
    expected_error: str,
) -> None:
    with pytest.raises(RuntimeError, match=f"^{expected_error}$"):
        invoke()  # type: ignore[operator]


def test_retired_entrypoints_cannot_touch_external_surfaces() -> None:
    callback = Mock()
    probes: list[Mock] = []
    with ExitStack() as stack:
        for target in (
            "builtins.open",
            "pathlib.Path.open",
            "pathlib.Path.read_text",
            "pathlib.Path.write_text",
            "pathlib.Path.mkdir",
            "pathlib.Path.touch",
            "pathlib.Path.rename",
            "pathlib.Path.unlink",
            "subprocess.run",
            "subprocess.Popen",
            "os.system",
            "os.putenv",
            "socket.socket",
            "urllib.request.urlopen",
        ):
            probes.append(stack.enter_context(patch(target)))

        for invoke, expected_error in (
            (sv_engine.SovereignEngine, ENGINE_ERROR),
            (wrap_it_up.SovereignWrapper, WRAP_ERROR),
            (loop.SovereignForge, WRAP_ERROR),
            (loop.SovereignLifecycle.execute, WRAP_ERROR),
            (audit_dialogue.DialogueAuditor, ENGINE_ERROR),
            (benchmark_engine.benchmark, ENGINE_ERROR),
            (latency_check.LatencyProfiler, ENGINE_ERROR),
        ):
            with pytest.raises(RuntimeError, match=f"^{expected_error}$"):
                invoke(callback=callback)

    callback.assert_not_called()
    for probe in probes:
        probe.assert_not_called()


def test_tombstones_are_import_free_and_contain_no_legacy_execution_code() -> None:
    forbidden = (
        "SovereignBootstrap",
        "SovereignOrchestrator",
        "AntigravityUplink",
        "SessionWarden",
        "subprocess",
        "socket",
        "requests",
        "urlopen",
        "open(",
        "read_text(",
        "write_text(",
        "git add",
        "git commit",
    )
    for relative in TOMBSTONES:
        source = (ROOT / relative).read_text(encoding="utf-8")
        tree = ast.parse(source)
        assert not any(isinstance(node, (ast.Import, ast.ImportFrom)) for node in ast.walk(tree))
        for token in forbidden:
            assert token not in source, (relative, token)


def test_security_scanner_uses_the_current_hud_without_legacy_engine_import() -> None:
    source = (ROOT / "src/tools/security_scan.py").read_text(encoding="utf-8")

    assert "from src.core.sovereign_hud import SovereignHUD" in source
    assert "from sv_engine import" not in source
