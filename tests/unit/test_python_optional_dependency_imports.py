from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


def _run_with_blocked_imports(script: str, *blocked_roots: str) -> subprocess.CompletedProcess[str]:
    bootstrap = f"""
import builtins
import sys

blocked = {set(blocked_roots)!r}
real_import = builtins.__import__
def guarded_import(name, *args, **kwargs):
    if name.split('.', 1)[0] in blocked:
        raise ModuleNotFoundError(name)
    return real_import(name, *args, **kwargs)
builtins.__import__ = guarded_import
sys.path.insert(0, {str(ROOT)!r})
"""
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    return subprocess.run(
        [sys.executable, "-c", bootstrap + script],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


@pytest.mark.parametrize(
    ("module_name", "blocked_roots"),
    [
        ("src.tools.debt_viz", ("radon",)),
        ("src.core.engine.wardens.mimir", ("radon",)),
        ("src.core.engine.wardens.valkyrie", ("vulture",)),
        ("src.tools.debug.check_pro", ("dotenv", "google")),
        ("src.core.bootstrap", ("dotenv",)),
        ("src.core.cstar_dispatcher", ("dotenv",)),
        ("src.core.sv_engine", ("dotenv",)),
    ],
)
def test_modules_import_without_optional_dependencies(
    module_name: str,
    blocked_roots: tuple[str, ...],
) -> None:
    result = _run_with_blocked_imports(f"import {module_name}\n", *blocked_roots)

    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    ("script", "blocked_roots", "expected_error"),
    [
        (
            "from src.tools.debt_viz import DebtAnalyzer\nDebtAnalyzer('.').analyze()\n",
            ("radon",),
            "optional_dependency_unavailable:radon",
        ),
        (
            "from src.core.engine.wardens.mimir import MimirWarden\nMimirWarden('.').scan()\n",
            ("radon",),
            "optional_dependency_unavailable:radon",
        ),
        (
            "from src.core.engine.wardens.valkyrie import ValkyrieWarden\nValkyrieWarden('.').scan()\n",
            ("vulture",),
            "optional_dependency_unavailable:vulture",
        ),
        (
            "from src.core.bootstrap import SovereignBootstrap\nSovereignBootstrap.execute()\n",
            ("dotenv",),
            "legacy_python_bootstrap_retired_use_cstar_kernel",
        ),
    ],
)
def test_missing_optional_dependency_fails_only_when_invoked(
    script: str,
    blocked_roots: tuple[str, ...],
    expected_error: str,
) -> None:
    result = _run_with_blocked_imports(script, *blocked_roots)

    assert result.returncode != 0
    assert expected_error in result.stderr


def test_check_pro_is_retired_without_importing_google_client() -> None:
    script = """
from src.tools.debug import check_pro
assert check_pro.main() == 1
"""
    result = _run_with_blocked_imports(script, "google")

    assert result.returncode == 0
    assert result.stderr == (
        "legacy_secret_vault_provider_tools_retired_use_supported_surfaces\n"
    )


@pytest.mark.parametrize("module_name", ["src.core.cstar_dispatcher", "src.core.sv_engine"])
def test_runtime_module_import_does_not_execute_bootstrap(module_name: str) -> None:
    script = f"""
import importlib
from src.core import bootstrap
assert bootstrap._BOOTSTRAPPED is False
importlib.import_module({module_name!r})
assert bootstrap._BOOTSTRAPPED is False
"""
    result = _run_with_blocked_imports(script, "dotenv")

    assert result.returncode == 0, result.stderr
