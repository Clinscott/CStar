from unittest.mock import patch

import pytest

from src.core.host_session import detect_host_provider, resolve_host_provider
from src.core.mimir_client import MimirClient


def test_cli_markers_are_inert_but_explicit_gemini_bridge_is_supported() -> None:
    assert detect_host_provider({"GEMINI_CLI_ACTIVE": "true"}) is None
    assert detect_host_provider({"GEMINI_CLI": "1"}) is None
    assert resolve_host_provider({"CORVUS_HOST_PROVIDER": "gemini"}) == "gemini"


@pytest.mark.asyncio
async def test_injected_gemini_bridge_provider_remains_supported(tmp_path) -> None:
    calls: list[tuple[str, str]] = []

    async def runner(prompt: str, provider: str) -> str:
        calls.append((prompt, provider))
        return "Gemini bridge response"

    client = MimirClient(
        project_root=tmp_path,
        env={"CORVUS_HOST_PROVIDER": "gemini"},
        host_session_active=True,
        host_provider="gemini",
        host_session_runner=runner,
    )

    response = await client.request(
        {
            "prompt": "Use the injected bridge.",
            "transport_mode": "host_session",
            "caller": {"source": "test:gemini-cli-retirement"},
        }
    )

    assert response.status == "success"
    assert response.raw_text == "Gemini bridge response"
    assert calls == [("Use the injected bridge.", "gemini")]


@pytest.mark.asyncio
async def test_gemini_provider_never_falls_back_to_cli(tmp_path) -> None:
    client = MimirClient(
        project_root=tmp_path,
        env={"CORVUS_HOST_PROVIDER": "gemini"},
        host_session_active=True,
        host_provider="gemini",
    )

    with patch("src.core.mimir_client.subprocess.run") as run:
        response = await client.request(
            {
                "prompt": "Do not invoke Gemini CLI.",
                "transport_mode": "host_session",
                "caller": {"source": "test:gemini-cli-retirement"},
            }
        )

    assert response.status == "error"
    assert "does not have an executable host-session bridge configured" in (response.error or "")
    run.assert_not_called()
