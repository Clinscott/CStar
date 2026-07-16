"""Adversarial contracts for the retained AutoBot Python tombstones."""

from __future__ import annotations

import contextlib
import importlib.util
import io
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = (
    "delegate.py",
    "enqueue.py",
    "queue_inspect.py",
    "queue_processor.py",
)
SCRIPT_ROOT = ROOT / ".agents" / "skills" / "autobot" / "scripts"
RETIRED_ERROR = "legacy_autobot_retired_use_cstar_forge"


def test_retired_entrypoints_are_import_safe_and_fail_identically() -> None:
    for index, script_name in enumerate(SCRIPTS):
        path = SCRIPT_ROOT / script_name
        spec = importlib.util.spec_from_file_location(f"retired_autobot_{index}", path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        imported_stderr = io.StringIO()
        with contextlib.redirect_stderr(imported_stderr):
            spec.loader.exec_module(module)
        assert imported_stderr.getvalue() == ""

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            assert module.main() == 1
        assert stderr.getvalue() == f"{RETIRED_ERROR}\n"


def test_retired_entrypoints_contain_no_execution_or_state_implementation() -> None:
    forbidden = (
        "argparse",
        "fcntl",
        "json",
        "os.environ",
        "pathlib",
        "subprocess",
        "hermes",
        "api_key",
        "open(",
        "write_text",
        "write_bytes",
        "retry",
        "delegate(",
    )
    for script_name in SCRIPTS:
        source = (SCRIPT_ROOT / script_name).read_text(encoding="utf-8").lower()
        for token in forbidden:
            assert token not in source, f"{script_name} retains forbidden token {token}"


def test_retired_skill_is_only_a_durable_forge_pointer() -> None:
    source = (ROOT / ".agents" / "skills" / "autobot" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    assert (
        "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute"
        in source
    )
    assert RETIRED_ERROR in source
    for forbidden in (
        "entry_surface:",
        "terminal_required:",
        "intent_category:",
        "python3 ",
        "--intent",
        "## When to use",
        "## Execution",
    ):
        assert forbidden not in source
