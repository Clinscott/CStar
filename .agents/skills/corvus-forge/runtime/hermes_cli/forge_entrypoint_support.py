"""Fail-closed parsing support for the private CStar Forge entrypoint."""

from __future__ import annotations

import http.client
import json
from collections.abc import Callable, Iterator
from typing import Any


class ForgeEntrypointError(RuntimeError):
    """Value-free failure suitable for the private delegate boundary."""


def _json_event(raw: bytes) -> dict[str, Any]:
    try:
        parsed = json.loads(raw.decode("utf-8", errors="strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ForgeEntrypointError("forge_entrypoint_response_invalid") from exc
    if not isinstance(parsed, dict):
        raise ForgeEntrypointError("forge_entrypoint_response_invalid")
    return parsed


def _sse_data_events(
    response: http.client.HTTPResponse, response_cap: int,
) -> Iterator[str]:
    """Yield bounded UTF-8 SSE data fields without retaining raw provider bytes."""
    consumed = 0
    pending: list[str] = []
    while True:
        remaining = response_cap - consumed
        if remaining <= 0:
            raise ForgeEntrypointError("forge_entrypoint_response_too_large")
        raw = response.readline(remaining + 1)
        if not raw:
            raise ForgeEntrypointError("forge_entrypoint_response_incomplete")
        consumed += len(raw)
        if consumed > response_cap:
            raise ForgeEntrypointError("forge_entrypoint_response_too_large")
        try:
            line = raw.decode("utf-8", errors="strict").rstrip("\r\n")
        except UnicodeDecodeError as exc:
            raise ForgeEntrypointError("forge_entrypoint_response_invalid") from exc
        if not line:
            if pending:
                yield "\n".join(pending)
                pending.clear()
            continue
        if line.startswith(":"):
            continue
        field, separator, value = line.partition(":")
        if field == "data":
            pending.append(value[1:] if separator and value.startswith(" ") else value)
        elif field not in {"event", "id", "retry"}:
            raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")


def _stream_usage(payload: dict[str, Any]) -> dict[str, int] | None:
    usage = payload.get("usage")
    if usage is None:
        return None
    if (not isinstance(usage, dict)
        or type(usage.get("prompt_tokens")) is not int or usage["prompt_tokens"] < 0
        or type(usage.get("completion_tokens")) is not int or usage["completion_tokens"] < 0):
        raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
    return {
        "input_tokens": usage["prompt_tokens"],
        "output_tokens": usage["completion_tokens"],
    }


def read_response(
    response: http.client.HTTPResponse,
    *,
    model: str,
    response_cap: int,
    journal: Callable[[str], None],
) -> tuple[str, dict[str, int]]:
    """Validate one bounded streaming response and return only text and usage."""
    if response.status != 200:
        raise ForgeEntrypointError("forge_entrypoint_provider_http_error")
    mime = response.getheader("content-type", "").split(";", 1)[0].strip().lower()
    if mime != "text/event-stream":
        raise ForgeEntrypointError("forge_entrypoint_response_content_type_invalid")
    response_id: str | None = None
    content: list[str] = []
    usage: dict[str, int] | None = None
    saw_assistant = False
    finish_reason: str | None = None
    saw_done = False
    for data in _sse_data_events(response, response_cap):
        if data == "[DONE]":
            saw_done = True
            journal("response_body_complete")
            break
        payload = _json_event(data.encode("utf-8"))
        if payload.get("object") != "chat.completion.chunk":
            raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
        event_id = payload.get("id")
        if not isinstance(event_id, str) or not event_id.strip():
            raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
        if response_id is None:
            response_id = event_id
        elif event_id != response_id:
            raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
        if payload.get("model") != model:
            raise ForgeEntrypointError("forge_entrypoint_response_model_mismatch")
        event_usage = _stream_usage(payload)
        if event_usage is not None:
            usage = event_usage
        choices = payload.get("choices")
        if not isinstance(choices, list) or len(choices) > 1:
            raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
        if not choices:
            continue
        choice = choices[0]
        if not isinstance(choice, dict) or choice.get("index") != 0:
            raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
        delta = choice.get("delta")
        if not isinstance(delta, dict) or "tool_calls" in delta or "function_call" in delta:
            raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
        if "role" in delta:
            if delta["role"] != "assistant":
                raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
            saw_assistant = True
        fragment = delta.get("content")
        if fragment is not None:
            if not isinstance(fragment, str):
                raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
            content.append(fragment)
        for reasoning_field in ("reasoning_content", "reasoning"):
            if reasoning_field in delta and not isinstance(delta[reasoning_field], (str, type(None))):
                raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
        current_finish = choice.get("finish_reason")
        if current_finish is not None:
            if current_finish != "stop" or finish_reason is not None:
                raise ForgeEntrypointError("forge_entrypoint_response_incomplete")
            finish_reason = current_finish
    text = "".join(content)
    if not saw_done or response_id is None or not saw_assistant or finish_reason != "stop":
        raise ForgeEntrypointError("forge_entrypoint_response_incomplete")
    if not text.strip():
        raise ForgeEntrypointError("forge_entrypoint_response_text_missing")
    if usage is None:
        raise ForgeEntrypointError("forge_entrypoint_response_schema_invalid")
    return text, usage
