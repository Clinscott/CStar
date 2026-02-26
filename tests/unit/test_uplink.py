from types import SimpleNamespace
from unittest.mock import AsyncMock, call, patch

import pytest

import src.cstar.core.uplink as uplink_module
from src.cstar.core.uplink import AntigravityUplink


def make_api_error(message, code):
    """Helper to create an APIError compatible with the real SDK."""
    try:
        from google.genai.errors import APIError
        # Real SDK: APIError(code, response_json, response=None)
        return APIError(code, {"error": {"message": message}})
    except ImportError:
        err = Exception(message)
        err.code = code
        return err


def mock_spinner(func):
    """Decorator to mock the _spinner method to properly await the task."""
    async def wrapper(*args, **kwargs):
        async def mock_spinner_impl(task, msg):
            return await task

        with patch.object(AntigravityUplink, "_spinner", side_effect=mock_spinner_impl):
            return await func(*args, **kwargs)
    return wrapper


@pytest.fixture(autouse=True)
def _force_sdk_available(monkeypatch):
    """Ensure _sdk_available() always returns True during tests."""
    monkeypatch.setattr(uplink_module, "_sdk_available", lambda: True)


@pytest.mark.asyncio
@mock_spinner
async def test_uplink_token_flood_truncation():
    """
    Verifies that the Uplink truncates massive payloads while preserving
    system prompt and the latest message.
    """
    with patch("google.genai.Client") as mock_client_class:
        mock_client = mock_client_class.return_value

        # 1. Mock count_tokens with side_effect
        mock_resp_1 = SimpleNamespace(total_tokens=3_500_000)
        mock_resp_2 = SimpleNamespace(total_tokens=500_000)
        mock_client.models.count_tokens.side_effect = [mock_resp_1, mock_resp_2]

        # 2. Mock generate_content
        mock_client.models.generate_content.return_value = SimpleNamespace(text="Truncation Success")

        uplink = AntigravityUplink(api_key="fake_key")

        # Build a massive history
        huge_history = [{"role": "user", "content": "spam " * 100}] * 10
        original_len = len(huge_history)
        system_prompt = "ACT_AS_ODIN"
        query = "current_intent"

        # Act
        response = await uplink.send_payload(query, {
            "history": huge_history.copy(),
            "system_prompt": system_prompt
        })

        # Assert
        assert response["data"]["raw"] == "Truncation Success"
        assert mock_client.models.count_tokens.call_count == 2

        call_args = mock_client.models.generate_content.call_args[1]
        truncated_history = call_args["contents"]
        assert len(truncated_history) < original_len + 1
        assert system_prompt in str(call_args["config"]["system_instruction"])
        assert query in truncated_history[-1]


@pytest.mark.asyncio
@mock_spinner
async def test_uplink_api_severance_retry():
    """
    Verifies that the Uplink executes exponential backoff for transient errors.
    """
    with patch("google.genai.Client") as mock_client_class:
        mock_client = mock_client_class.return_value

        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_client.models.generate_content.side_effect = [
                make_api_error("Service Unavailable", 503),
                make_api_error("Internal Server Error", 500),
                SimpleNamespace(text="Recovery Success")
            ]

            uplink = AntigravityUplink(api_key="fake_key")

            # Act
            response = await uplink.send_payload("test_query")

            # Assert
            assert response["data"]["raw"] == "Recovery Success"
            assert mock_client.models.generate_content.call_count == 3
            assert mock_sleep.call_count == 2
            mock_sleep.assert_has_calls([call(2), call(4)])


@pytest.mark.asyncio
@mock_spinner
async def test_uplink_fatal_exhaustion():
    """
    Verifies that the Uplink eventually gives up after max retries.
    """
    with patch("google.genai.Client") as mock_client_class:
        mock_client = mock_client_class.return_value

        with patch("asyncio.sleep", new_callable=AsyncMock):
            mock_client.models.generate_content.side_effect = [
                make_api_error("Persistent 503", 503)
            ] * 4

            uplink = AntigravityUplink(api_key="fake_key")

            # Act
            response = await uplink.send_payload("test_query")

            assert response["status"] == "error"
            assert "Uplink Severed" in response["message"]
            assert response["fallback"] is True
            assert mock_client.models.generate_content.call_count == 4
