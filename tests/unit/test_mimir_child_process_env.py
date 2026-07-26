from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import pytest

from src.core.child_process_env import sanitize_child_process_env
from src.core.host_session import HostProvider
from src.core.mimir_client import MimirClient


RETIRED_KEYS = {
    "GEMINI_API_KEY",
    "GEMINI_CLI",
    "GEMINI_CLI_ACTIVE",
    "GEMINI_CLI_SUBAGENTS",
    "GOOGLE_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_API_DAEMON_KEY",
    "GOOGLE_GENAI_ACCESS_TOKEN",
    "GOOGLE_GENAI_API_KEY",
    "GOOGLE_GENAI_USE_VERTEXAI",
    "GOOGLE_GEMINI_API_KEY",
    "GOOGLE_GEMINI_SESSION_TOKEN",
    "MUNINN_API_KEY",
}
PRESERVED_ENV = {
    "PATH": "/test/bin",
    "CODEX_SHELL": "1",
    "CODEX_THREAD_ID": "thread-test",
    "CLAUDE_SUBAGENTS": "true",
    "DROID_CLI_ACTIVE": "true",
    "OPENAI_API_KEY": "preserved-openai",
    "ANTHROPIC_API_KEY": "preserved-anthropic",
    "MINIMAX_API_KEY": "preserved-minimax",
    "XPREMIUM_OAUTH_STATE": "preserved-xpremium",
    "HERMES_PROFILE": "preserved-hermes",
    "GOOGLE_CLOUD_PROJECT": "preserved-google-project",
}
MIXED_CASE_RETIRED_ENV = {
    "gemini_api_key": "retired-1",
    "Gemini_Cli": "retired-2",
    "gEmInI_cLi_AcTiVe": "retired-3",
    "GEMINI_cli_SUBAGENTS": "retired-4",
    "google_api_key": "retired-5",
    "Google_Application_Credentials": "retired-6",
    "GOOGLE_api_DAEMON_KEY": "retired-7",
    "muninn_api_key": "retired-8",
    "GoOgLe_GeNaI_ApI_kEy": "retired-9",
    "google_genai_access_token": "retired-10",
    "gOoGlE_gEnAi_UsE_vErTeXaI": "retired-11",
    "Google_Gemini_Api_Key": "retired-12",
    "GOOGLE_gemini_session_token": "retired-13",
}


def _contract_env(**overrides: str) -> dict[str, str]:
    return {
        **PRESERVED_ENV,
        **MIXED_CASE_RETIRED_ENV,
        **overrides,
    }


def _assert_child_env(child_env: dict[str, str]) -> None:
    assert not (set(key.upper() for key in child_env) & RETIRED_KEYS)
    for key, value in PRESERVED_ENV.items():
        assert child_env[key] == value


def _capture_subprocess(
    monkeypatch: pytest.MonkeyPatch,
    *,
    response: str,
) -> list[tuple[list[str], dict[str, Any]]]:
    calls: list[tuple[list[str], dict[str, Any]]] = []

    def fake_run(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(args=args, returncode=0, stdout=response, stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    return calls


def test_sanitizer_is_case_insensitive_and_does_not_mutate_input() -> None:
    source_env = _contract_env()
    source_snapshot = dict(source_env)
    process_snapshot = dict(os.environ)

    child_env = sanitize_child_process_env(source_env)
    source_env["OPENAI_API_KEY"] = "updated-openai"
    refreshed_child_env = sanitize_child_process_env(source_env)

    _assert_child_env(child_env)
    assert refreshed_child_env["OPENAI_API_KEY"] == "updated-openai"
    assert child_env is not source_env
    assert source_env == {**source_snapshot, "OPENAI_API_KEY": "updated-openai"}
    assert dict(os.environ) == process_snapshot


@pytest.mark.asyncio
async def test_configured_bridge_receives_only_sanitized_child_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_env = _contract_env(
        CORVUS_CODEX_HOST_BRIDGE_CMD="codex-host-bridge",
        CORVUS_CODEX_HOST_BRIDGE_ARGS_JSON='["--prompt", "{prompt}"]',
    )
    source_snapshot = dict(source_env)
    calls = _capture_subprocess(monkeypatch, response="configured response")
    client = MimirClient(
        project_root=tmp_path,
        env=source_env,
        host_session_active=True,
        host_provider="codex",
    )

    response = await client.request(
        {"prompt": "configured request", "transport_mode": "host_session"}
    )

    assert response.status == "success"
    assert calls[0][0] == ["codex-host-bridge", "--prompt", "configured request"]
    _assert_child_env(calls[0][1]["env"])
    assert source_env == source_snapshot


@pytest.mark.parametrize(
    ("provider", "expected_command"),
    [("codex", "codex"), ("claude", "claude")],
)
@pytest.mark.asyncio
async def test_builtin_host_receives_only_sanitized_child_env(
    provider: HostProvider,
    expected_command: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_env = _contract_env()
    source_snapshot = dict(source_env)
    calls = _capture_subprocess(monkeypatch, response=f"{provider} response")
    client = MimirClient(
        project_root=tmp_path,
        env=source_env,
        host_session_active=True,
        host_provider=provider,
    )

    response = await client.request(
        {"prompt": "built-in request", "transport_mode": "host_session"}
    )

    assert response.status == "success"
    assert calls[0][0][0] == expected_command
    _assert_child_env(calls[0][1]["env"])
    assert source_env == source_snapshot


@pytest.mark.asyncio
async def test_oracle_uses_sanitized_injected_client_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_env = _contract_env(CORVUS_HOST_SESSION_ACTIVE="false")
    source_snapshot = dict(source_env)
    calls = _capture_subprocess(monkeypatch, response="")
    client = MimirClient(
        project_root=tmp_path,
        env=source_env,
        host_session_active=False,
    )

    await client._invoke_oracle(41)

    assert "oracle" in calls[0][0]
    assert calls[0][0][-3:] == ["41", "--db", "--silent"]
    _assert_child_env(calls[0][1]["env"])
    assert calls[0][1]["env"]["CORVUS_HOST_SESSION_ACTIVE"] == "false"
    assert source_env == source_snapshot
