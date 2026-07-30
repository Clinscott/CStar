from __future__ import annotations

import inspect

import pytest

from src.core.engine import env_adapter


def test_environment_adapter_rejects_before_ambient_host_inspection() -> None:
    with pytest.raises(
        RuntimeError,
        match=f"^{env_adapter.RETIRED_ENV_ADAPTER_ERROR}$",
    ):
        env_adapter.EnvAdapter()


def test_environment_adapter_source_has_no_inference_or_execution_route() -> None:
    source = inspect.getsource(env_adapter)

    for forbidden in (
        "os.environ",
        "sys.modules",
        "GEMINI_CLI_SUBAGENTS",
        "CODEX_SUBAGENTS",
        "CLAUDE_SUBAGENTS",
        '"action": "DELEGATE"',
        '"action": "INJECT"',
    ):
        assert forbidden not in source
