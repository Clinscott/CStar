from __future__ import annotations

import importlib
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

import pytest

try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10 compatibility; pytest installs tomli there.
    import tomli as tomllib


ROOT = Path(__file__).resolve().parents[2]
ERROR = "legacy_python_cstar_dispatcher_retired_use_node_kernel"


def _assert_retired(call: Callable[[], object]) -> None:
    with pytest.raises(RuntimeError, match=f"^{ERROR}$"):
        call()


def test_import_is_safe_and_does_not_load_retired_dependencies() -> None:
    before_env = os.environ.copy()
    retired_dependencies = (
        "src.core.bootstrap",
        "src.core.runtime_env",
        "src.core.sovereign_hud",
    )
    before_dependencies = {
        module_name: module_name in sys.modules for module_name in retired_dependencies
    }
    sys.modules.pop("src.core.cstar_dispatcher", None)
    module = importlib.import_module("src.core.cstar_dispatcher")

    assert module.LEGACY_PYTHON_CSTAR_DISPATCHER_ERROR == ERROR
    assert os.environ == before_env
    assert {
        module_name: module_name in sys.modules for module_name in retired_dependencies
    } == before_dependencies


def test_constructor_and_discovery_fail_closed_without_side_effects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = importlib.import_module("src.core.cstar_dispatcher")

    def forbidden(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("retired_dispatcher_side_effect")

    monkeypatch.setattr(Path, "exists", forbidden)
    monkeypatch.setattr(Path, "glob", forbidden)
    monkeypatch.setattr(Path, "iterdir", forbidden)
    monkeypatch.setattr(Path, "read_text", forbidden)
    monkeypatch.setattr(Path, "write_text", forbidden)
    monkeypatch.setattr(subprocess, "run", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)

    _assert_retired(lambda: module.CorvusDispatcher(root=ROOT))
    dispatcher = object.__new__(module.CorvusDispatcher)
    _assert_retired(dispatcher._discover_all)
    _assert_retired(dispatcher._load_registry_manifest)
    _assert_retired(dispatcher.show_help)
    _assert_retired(lambda: dispatcher.run(["anything"]))
    _assert_retired(lambda: dispatcher._execute_skill("anything", []))
    _assert_retired(
        lambda: dispatcher._record_agentic_heartbeat("anything", 0.0, 0, 0.0)
    )


def test_main_and_direct_module_execution_return_the_stable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = importlib.import_module("src.core.cstar_dispatcher")
    monkeypatch.setattr(sys, "argv", ["cstar", "hall", "anything"])

    _assert_retired(module.main)

    result = subprocess.run(
        [sys.executable, "-m", "src.core.cstar_dispatcher", "hall", "anything"],
        cwd=ROOT,
        env={**os.environ, "PYTHONPATH": str(ROOT)},
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert ERROR in result.stderr
    assert result.stdout == ""


def test_python_package_does_not_publish_the_canonical_cstar_command() -> None:
    metadata = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    scripts = metadata.get("project", {}).get("scripts", {})

    assert "cstar" not in scripts
    assert all("src.core.cstar_dispatcher" not in target for target in scripts.values())
