"""Fail-closed parsing support for the private CStar Forge entrypoint."""

from __future__ import annotations

import hashlib
import heapq
import http.client
import json
from collections.abc import Callable, Iterator
from typing import Any


class ForgeEntrypointError(RuntimeError):
    """Value-free failure suitable for the private delegate boundary."""

    def __init__(
        self,
        code: str,
        *,
        trace_code: str | None = None,
        schema_fingerprint: dict[str, object] | None = None,
    ) -> None:
        super().__init__(code)
        self.trace_code = trace_code or code
        self.schema_fingerprint = schema_fingerprint


_KNOWN_SCHEMA_KEYS = frozenset({
    "accepted_prediction_tokens", "cached_tokens", "choices",
    "completion_tokens", "completion_tokens_details", "content", "created",
    "delta", "finish_reason", "function_call", "id", "index", "logprobs",
    "model", "object", "prompt_tokens", "prompt_tokens_details",
    "reasoning", "reasoning_content", "reasoning_tokens",
    "rejected_prediction_tokens", "role", "service_tier",
    "system_fingerprint", "tool_calls", "total_tokens", "usage",
})
_PARSER_STATE_CODES = {
    "sse_field": "sse",
    "payload_object": "obj",
    "event_id": "eid",
    "event_id_consistency": "ids",
    "usage": "use",
    "choices": "cho",
    "choice": "one",
    "delta": "del",
    "role": "rol",
    "content": "txt",
    "reasoning": "rea",
    "finish_reason": "fin",
}
_MAX_SHAPE_NODES = 24
_MAX_OBJECT_KEYS = 12
_MAX_LIST_ITEMS = 4
_MAX_SHAPE_DEPTH = 4


def _json_value_type(value: Any) -> str:
    if value is None:
        return "null"
    if type(value) is bool:
        return "boolean"
    if type(value) is int:
        return "integer"
    if type(value) is float:
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "list"
    if isinstance(value, dict):
        return "object"
    return "unsupported"


def _key_label(key: str) -> str:
    if key in _KNOWN_SCHEMA_KEYS:
        return key
    digest = hashlib.sha256(key.encode("utf-8", errors="strict")).hexdigest()
    return f"key_sha256_{digest[:12]}"


def _list_cardinality(value: list[Any]) -> str:
    if not value:
        return "empty"
    if len(value) == 1:
        return "one"
    if len(value) <= _MAX_LIST_ITEMS:
        return "few"
    return "many"


def _shape_summary(value: Any) -> dict[str, object]:
    """Return a bounded value-free summary of one decoded JSON shape."""
    keys: set[str] = set()
    value_types: set[str] = set()
    list_cardinalities: set[str] = set()
    nodes = 0
    truncated = False

    def walk(item: Any, path: str, depth: int) -> None:
        nonlocal nodes, truncated
        if nodes >= _MAX_SHAPE_NODES:
            truncated = True
            return
        nodes += 1
        item_type = _json_value_type(item)
        value_types.add(f"{path}:{item_type}")
        if depth >= _MAX_SHAPE_DEPTH:
            if item_type in {"object", "list"}:
                truncated = True
            return
        if isinstance(item, dict):
            if len(item) > _MAX_OBJECT_KEYS:
                truncated = True
            selected = heapq.nsmallest(
                _MAX_OBJECT_KEYS, item, key=lambda key: _key_label(str(key)),
            )
            for key in selected:
                label = _key_label(str(key))
                child_path = f"{path}.{label}"
                keys.add(child_path)
                walk(item[key], child_path, depth + 1)
        elif isinstance(item, list):
            list_cardinalities.add(f"{path}:{_list_cardinality(item)}")
            if len(item) > _MAX_LIST_ITEMS:
                truncated = True
            for child in item[:_MAX_LIST_ITEMS]:
                walk(child, f"{path}[]", depth + 1)

    walk(value, "$", 0)
    return {
        "keys": sorted(keys),
        "json_value_types": sorted(value_types),
        "list_cardinalities": sorted(list_cardinalities),
        "truncated": truncated,
    }


def _schema_fingerprint(payload: Any, parser_state: str) -> dict[str, object]:
    state_code = _PARSER_STATE_CODES[parser_state]
    shape = _shape_summary(payload)
    encoded = json.dumps(
        shape, ensure_ascii=True, separators=(",", ":"), sort_keys=True,
    ).encode("ascii")
    shape_hash = hashlib.sha256(encoded).hexdigest()
    return {
        "schema": "cstar.forge_response_schema_fingerprint.v1",
        "parser_state": parser_state,
        "parser_state_code": state_code,
        **shape,
        "shape_sha256": shape_hash,
    }


def _raise_schema_invalid(payload: Any, parser_state: str) -> None:
    fingerprint = _schema_fingerprint(payload, parser_state)
    trace_code = (
        "forge_entrypoint_response_schema_invalid_"
        f"{fingerprint['parser_state_code']}_{fingerprint['shape_sha256']}"
    )
    raise ForgeEntrypointError(
        "forge_entrypoint_response_schema_invalid",
        trace_code=trace_code,
        schema_fingerprint=fingerprint,
    )


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
    """Yield bounded UTF-8 SSE data fields without retaining raw provider bytes.

    A clean EOF between events is a valid OpenAI-compatible stream terminator.
    EOF inside an event remains incomplete and can never promote partial JSON.
    """
    consumed = 0
    pending: list[str] = []
    while True:
        remaining = response_cap - consumed
        if remaining == 0:
            raw = response.readline(1)
            if not raw:
                if pending:
                    raise ForgeEntrypointError("forge_entrypoint_response_incomplete")
                return
            raise ForgeEntrypointError("forge_entrypoint_response_too_large")
        raw = response.readline(remaining + 1)
        if not raw:
            if pending:
                raise ForgeEntrypointError("forge_entrypoint_response_incomplete")
            return
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
            _raise_schema_invalid({field: None}, "sse_field")


def _stream_usage(payload: dict[str, Any]) -> dict[str, int] | None:
    usage = payload.get("usage")
    if usage is None:
        return None
    if (not isinstance(usage, dict)
        or type(usage.get("prompt_tokens")) is not int or usage["prompt_tokens"] < 0
        or type(usage.get("completion_tokens")) is not int or usage["completion_tokens"] < 0):
        _raise_schema_invalid(payload, "usage")
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
    saw_reasoning = False
    finish_reason: str | None = None
    for data in _sse_data_events(response, response_cap):
        if data == "[DONE]":
            break
        payload = _json_event(data.encode("utf-8"))
        if payload.get("object") != "chat.completion.chunk":
            _raise_schema_invalid(payload, "payload_object")
        event_id = payload.get("id")
        if not isinstance(event_id, str) or not event_id.strip():
            _raise_schema_invalid(payload, "event_id")
        if response_id is None:
            response_id = event_id
        elif event_id != response_id:
            _raise_schema_invalid(payload, "event_id_consistency")
        if payload.get("model") != model:
            raise ForgeEntrypointError("forge_entrypoint_response_model_mismatch")
        event_usage = _stream_usage(payload)
        if event_usage is not None:
            if usage is not None and event_usage != usage:
                _raise_schema_invalid(payload, "usage")
            usage = event_usage
        choices = payload.get("choices")
        if not isinstance(choices, list) or len(choices) > 1:
            _raise_schema_invalid(payload, "choices")
        if not choices:
            if event_usage is None:
                _raise_schema_invalid(payload, "choices")
            continue
        choice = choices[0]
        if not isinstance(choice, dict) or choice.get("index") != 0:
            _raise_schema_invalid(payload, "choice")
        delta = choice.get("delta")
        if not isinstance(delta, dict) or "tool_calls" in delta or "function_call" in delta:
            _raise_schema_invalid(payload, "delta")
        if "role" in delta:
            if delta["role"] != "assistant":
                _raise_schema_invalid(payload, "role")
            saw_assistant = True
        fragment = delta.get("content")
        if fragment is not None:
            if not isinstance(fragment, str):
                _raise_schema_invalid(payload, "content")
            content.append(fragment)
        for reasoning_field in ("reasoning_content", "reasoning"):
            if reasoning_field in delta and not isinstance(delta[reasoning_field], (str, type(None))):
                _raise_schema_invalid(payload, "reasoning")
            if isinstance(delta.get(reasoning_field), str) and delta[reasoning_field]:
                saw_reasoning = True
        current_finish = choice.get("finish_reason")
        if current_finish is not None:
            if current_finish == "tool_calls":
                raise ForgeEntrypointError("forge_entrypoint_response_tool_calls_unsupported")
            if current_finish not in {"stop", "length"} or finish_reason is not None:
                _raise_schema_invalid(payload, "finish_reason")
            finish_reason = current_finish
    journal("response_body_complete")
    text = "".join(content)
    if response_id is None or not saw_assistant:
        raise ForgeEntrypointError("forge_entrypoint_response_terminal_missing")
    if finish_reason == "length":
        if saw_reasoning and not text.strip():
            raise ForgeEntrypointError("forge_entrypoint_response_reasoning_exhausted")
        raise ForgeEntrypointError("forge_entrypoint_response_truncated_length")
    if finish_reason != "stop":
        raise ForgeEntrypointError("forge_entrypoint_response_terminal_missing")
    if not text.strip():
        raise ForgeEntrypointError("forge_entrypoint_response_text_missing")
    if usage is None:
        raise ForgeEntrypointError("forge_entrypoint_response_usage_missing")
    return text, usage
