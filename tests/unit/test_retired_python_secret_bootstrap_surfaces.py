from __future__ import annotations

import builtins
import os
import socket
import subprocess
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import Any

import pytest

from src.core import bootstrap
from src.core.engine.diagnostic import harvest_responses
from src.core.redactor import Redactor
from src.skills.local.KnowledgeHunter import hunter
from src.tools import brave_search, list_models, vault
from src.tools.debug import check_pro


ROOT = Path(__file__).resolve().parents[2]


def _advance(coroutine: Coroutine[Any, Any, Any]) -> None:
    try:
        coroutine.send(None)
    finally:
        coroutine.close()


RETIREMENT_ACTIONS: tuple[tuple[str, str, Callable[[], object]], ...] = (
    (
        "bootstrap",
        bootstrap.RETIRED_PYTHON_BOOTSTRAP_ERROR,
        bootstrap.SovereignBootstrap.execute,
    ),
    (
        "dotenv compatibility",
        bootstrap.RETIRED_PYTHON_BOOTSTRAP_ERROR,
        lambda: bootstrap.load_dotenv("synthetic.env"),
    ),
    (
        "Brave search",
        brave_search.RETIRED_PYTHON_SOURCE_TOOL_ERROR,
        lambda: brave_search.BraveSearch().search("synthetic query"),
    ),
    (
        "Brave quota write",
        brave_search.RETIRED_PYTHON_SOURCE_TOOL_ERROR,
        lambda: brave_search.BraveSearch()._save_ledger({"synthetic": True}),
    ),
    (
        "response harvest",
        harvest_responses.RETIRED_PYTHON_SOURCE_TOOL_ERROR,
        lambda: _advance(harvest_responses.Harvester.execute(cycles=1)),
    ),
    (
        "response recording",
        harvest_responses.RETIRED_PYTHON_SOURCE_TOOL_ERROR,
        lambda: _advance(
            harvest_responses.ResponseRecorder(object()).record_call(
                "synthetic prompt",
            )
        ),
    ),
    (
        "response persistence",
        harvest_responses.RETIRED_PYTHON_SOURCE_TOOL_ERROR,
        lambda: harvest_responses.ResponseRecorder(object()).save(
            Path("synthetic.json"),
        ),
    ),
    (
        "knowledge hunt",
        hunter.RETIRED_PYTHON_SOURCE_TOOL_ERROR,
        lambda: _advance(hunter.KnowledgeHunter().hunt("synthetic topic")),
    ),
    (
        "secret vault",
        vault.RETIRED_SECRET_PROVIDER_TOOL_ERROR,
        vault.SovereignVault,
    ),
    (
        "model listing",
        list_models.RETIRED_SECRET_PROVIDER_TOOL_ERROR,
        list_models.ModelLister.execute,
    ),
    (
        "provider accessor",
        check_pro.RETIRED_SECRET_PROVIDER_TOOL_ERROR,
        check_pro._require_genai,
    ),
    (
        "provider dotenv hook",
        check_pro.RETIRED_SECRET_PROVIDER_TOOL_ERROR,
        lambda: check_pro.load_dotenv("synthetic.env"),
    ),
)


@pytest.mark.parametrize(
    ("label", "expected_error", "action"),
    RETIREMENT_ACTIONS,
    ids=[entry[0] for entry in RETIREMENT_ACTIONS],
)
def test_retired_entrypoints_fail_before_any_external_effect(
    label: str,
    expected_error: str,
    action: Callable[[], object],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del label
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CSTAR_SYNTHETIC_SECRET", "synthetic-secret-canary")
    effects: list[str] = []

    def reject(effect: str):
        def rejected(*_args: object, **_kwargs: object) -> None:
            effects.append(effect)
            raise AssertionError(f"unexpected_effect:{effect}")

        return rejected

    monkeypatch.setattr(builtins, "open", reject("open"))
    monkeypatch.setattr(os, "getenv", reject("getenv"))
    for method in (
        "exists",
        "mkdir",
        "open",
        "read_bytes",
        "read_text",
        "write_bytes",
        "write_text",
    ):
        monkeypatch.setattr(Path, method, reject(f"path.{method}"))
    monkeypatch.setattr(socket, "create_connection", reject("network"))
    monkeypatch.setattr(socket, "socket", reject("socket"))
    monkeypatch.setattr(subprocess, "Popen", reject("process"))
    monkeypatch.setattr(subprocess, "run", reject("process"))

    with pytest.raises(RuntimeError, match=f"^{expected_error}$"):
        action()

    assert effects == []
    assert os.listdir(tmp_path) == []


@pytest.mark.parametrize(
    "entrypoint",
    (
        brave_search.main,
        harvest_responses.main,
        hunter.main,
        vault.main,
        list_models.main,
        check_pro.main,
    ),
)
def test_retired_cli_help_and_readiness_are_no_effect(
    entrypoint: Callable[[], int],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CSTAR_SYNTHETIC_SECRET", "synthetic-secret-canary")

    assert entrypoint() == 1
    assert list(tmp_path.iterdir()) == []


def test_redactor_masks_only_explicit_in_memory_values() -> None:
    text = "alpha synthetic-long-canary omega synthetic"
    redactor = Redactor(
        {
            "SHORT": "synthetic",
            "LONG": "synthetic-long-canary",
        }
    )

    assert redactor.redact(text) == (
        "alpha [REDACTED_LONG] omega [REDACTED_SHORT]"
    )
    assert Redactor().redact(text) == text
    assert Redactor.redact_shorthand(text) == text


def test_retired_sources_do_not_import_effectful_clients() -> None:
    paths = (
        "src/core/bootstrap.py",
        "src/tools/brave_search.py",
        "src/core/engine/diagnostic/harvest_responses.py",
        "src/skills/local/KnowledgeHunter/hunter.py",
        "src/tools/vault.py",
        "src/core/redactor.py",
        "src/tools/list_models.py",
        "src/tools/debug/check_pro.py",
    )
    forbidden = (
        "from dotenv",
        "import requests",
        "from google",
        "import google",
        "from cryptography",
        "AntigravityUplink",
        "SovereignHUD",
        "send_payload",
        ".read_text(",
        ".write_text(",
        ".read_bytes(",
        ".write_bytes(",
        ".mkdir(",
        "os.getenv(",
    )

    for relative in paths:
        source = (ROOT / relative).read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in source, (relative, token)
