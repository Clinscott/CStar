from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RUNTIME = ROOT / ".agents" / "skills" / "corvus-forge" / "runtime"
sys.path.insert(0, str(RUNTIME))

from hermes_cli.forge_entrypoint_support import (  # noqa: E402
    ForgeEntrypointError,
    read_response,
)


MODEL = "MiniMax-M3"


class Response:
    status = 200

    def __init__(self, lines: list[bytes], content_type: str = "text/event-stream") -> None:
        self.lines = iter(lines)
        self.content_type = content_type

    def getheader(self, _name: str, _default: str = "") -> str:
        return self.content_type

    def readline(self, _size: int) -> bytes:
        return next(self.lines, b"")


def event(payload: dict[str, object] | str) -> list[bytes]:
    text = payload if isinstance(payload, str) else json.dumps(
        payload, ensure_ascii=True, separators=(",", ":"),
    )
    return [f"data: {text}\n".encode("ascii"), b"\n"]


def chunk(
    *, response_id: str = "chatcmpl-test", model: str = MODEL,
    content: str | None = None, reasoning: str | None = None,
    finish_reason: str | None = None,
) -> dict[str, object]:
    delta: dict[str, object] = {}
    if content is not None:
        delta["content"] = content
    if reasoning is not None:
        delta["reasoning_content"] = reasoning
    return {
        "id": response_id,
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [{
            "index": 0,
            "delta": delta,
            "finish_reason": finish_reason,
        }],
    }


def role_chunk() -> dict[str, object]:
    payload = chunk(content="")
    payload["choices"][0]["delta"]["role"] = "assistant"
    return payload


def usage_chunk() -> dict[str, object]:
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion.chunk",
        "model": MODEL,
        "choices": [],
        "usage": {
            "prompt_tokens": 11,
            "completion_tokens": 7,
            "total_tokens": 18,
        },
    }


class PrivateHermesStreamingTest(unittest.TestCase):
    def read(
        self, lines: list[bytes], *, response_cap: int = 8192,
    ) -> tuple[tuple[str, dict[str, int]] | None, list[str], str | None]:
        journal: list[str] = []
        try:
            result = read_response(
                Response(lines), model=MODEL, response_cap=response_cap,
                journal=journal.append,
            )
            return result, journal, None
        except ForgeEntrypointError as exc:
            return None, journal, str(exc)

    def complete_lines(self, *, done: bool) -> list[bytes]:
        lines = [
            *event(role_chunk()),
            *event(chunk(content='{"status":"ok"}', finish_reason="stop")),
            *event(usage_chunk()),
        ]
        if done:
            lines.extend(event("[DONE]"))
        return lines

    def schema_exception(self, lines: list[bytes]) -> ForgeEntrypointError:
        with self.assertRaises(ForgeEntrypointError) as captured:
            read_response(
                Response(lines), model=MODEL, response_cap=8192,
                journal=lambda _state: None,
            )
        self.assertEqual(
            str(captured.exception), "forge_entrypoint_response_schema_invalid",
        )
        return captured.exception

    def test_accepts_done_and_clean_eof_terminal_variants(self) -> None:
        for done in (True, False):
            with self.subTest(done=done):
                result, journal, error = self.read(self.complete_lines(done=done))
                self.assertIsNone(error)
                self.assertEqual(result, (
                    '{"status":"ok"}',
                    {"input_tokens": 11, "output_tokens": 7},
                ))
                self.assertEqual(journal, ["response_body_complete"])

    def test_usage_only_terminal_chunk_may_precede_done(self) -> None:
        result, journal, error = self.read(self.complete_lines(done=True))
        self.assertIsNone(error)
        self.assertIsNotNone(result)
        self.assertEqual(journal, ["response_body_complete"])

    def test_length_is_never_accepted_as_complete_json(self) -> None:
        for content in ('{"status":', '{"status":"looks-complete"}'):
            with self.subTest(content=content):
                lines = [
                    *event(role_chunk()),
                    *event(chunk(content=content, finish_reason="length")),
                    *event(usage_chunk()),
                    *event("[DONE]"),
                ]
                result, journal, error = self.read(lines)
                self.assertIsNone(result)
                self.assertEqual(error, "forge_entrypoint_response_truncated_length")
                self.assertEqual(journal, ["response_body_complete"])

    def test_reasoning_only_length_has_exact_exhaustion_class(self) -> None:
        lines = [
            *event(role_chunk()),
            *event(chunk(reasoning="analysis", finish_reason="length")),
            *event(usage_chunk()),
            *event("[DONE]"),
        ]
        result, journal, error = self.read(lines)
        self.assertIsNone(result)
        self.assertEqual(error, "forge_entrypoint_response_reasoning_exhausted")
        self.assertEqual(journal, ["response_body_complete"])

    def test_tool_calls_terminal_is_explicitly_unsupported(self) -> None:
        lines = [
            *event(role_chunk()),
            *event(chunk(content="partial", finish_reason="tool_calls")),
        ]
        result, journal, error = self.read(lines)
        self.assertIsNone(result)
        self.assertEqual(error, "forge_entrypoint_response_tool_calls_unsupported")
        self.assertEqual(journal, [])

    def test_missing_usage_is_terminal_but_rejected(self) -> None:
        lines = [
            *event(role_chunk()),
            *event(chunk(content='{"status":"ok"}', finish_reason="stop")),
            *event("[DONE]"),
        ]
        result, journal, error = self.read(lines)
        self.assertIsNone(result)
        self.assertEqual(error, "forge_entrypoint_response_usage_missing")
        self.assertEqual(journal, ["response_body_complete"])

    def test_invalid_id_model_and_multichoice_fail_closed(self) -> None:
        second = chunk(content="x")
        multiple = chunk(content="x")
        multiple["choices"].append(second["choices"][0])
        cases = [
            (
                [*event(role_chunk()), *event(chunk(
                    response_id="chatcmpl-other", content="x", finish_reason="stop",
                ))],
                "forge_entrypoint_response_schema_invalid",
            ),
            (
                [*event(role_chunk()), *event(chunk(
                    model="MiniMax-other", content="x", finish_reason="stop",
                ))],
                "forge_entrypoint_response_model_mismatch",
            ),
            (
                [*event(role_chunk()), *event(multiple)],
                "forge_entrypoint_response_schema_invalid",
            ),
        ]
        for lines, expected in cases:
            with self.subTest(expected=expected):
                result, journal, error = self.read(lines)
                self.assertIsNone(result)
                self.assertEqual(error, expected)
                self.assertEqual(journal, [])

    def test_schema_fingerprint_is_bounded_deterministic_and_value_free(self) -> None:
        key_canary = "provider-secret-key-canary"

        def invalid_payload(value_canary: str) -> dict[str, object]:
            return {
                "id": value_canary,
                "object": f"unexpected-{value_canary}",
                "model": MODEL,
                "choices": [{
                    "index": 0,
                    "delta": {
                        "reasoning": f"reasoning-{value_canary}",
                        "content": f"content-{value_canary}",
                    },
                    "finish_reason": None,
                }],
                key_canary: {
                    "Authorization": f"Bearer {value_canary}",
                    "headers": [value_canary, f"token-{value_canary}"],
                },
            }

        first = self.schema_exception(event(invalid_payload("value-canary-one")))
        second = self.schema_exception(event(invalid_payload("value-canary-two")))
        fingerprint = first.schema_fingerprint
        self.assertIsNotNone(fingerprint)
        self.assertEqual(fingerprint, second.schema_fingerprint)
        self.assertEqual(fingerprint["parser_state"], "payload_object")
        self.assertEqual(fingerprint["parser_state_code"], "obj")
        self.assertIn("$.choices", fingerprint["keys"])
        self.assertIn("$.choices:list", fingerprint["json_value_types"])
        self.assertIn("$.choices:one", fingerprint["list_cardinalities"])
        self.assertRegex(fingerprint["shape_sha256"], r"^[a-f0-9]{64}$")
        self.assertEqual(
            first.trace_code,
            "forge_entrypoint_response_schema_invalid_obj_"
            f"{fingerprint['shape_sha256']}",
        )
        self.assertLessEqual(len(first.trace_code), 113)
        serialized = json.dumps(fingerprint, separators=(",", ":"), sort_keys=True)
        self.assertLessEqual(len(serialized.encode("ascii")), 8192)
        for canary in (
            key_canary, "Authorization", "headers",
            "value-canary-one", "value-canary-two",
        ):
            self.assertNotIn(canary, serialized)
            self.assertNotIn(canary, first.trace_code)

    def test_schema_fingerprint_separates_parser_state_from_shape(self) -> None:
        missing_id = chunk(response_id="", content="x")
        invalid_id = self.schema_exception(event(missing_id))
        valid_shape = chunk(response_id="chatcmpl-test", content="x")
        changed_id = chunk(response_id="chatcmpl-other", content="x")
        inconsistent_id = self.schema_exception([
            *event(valid_shape), *event(changed_id),
        ])
        self.assertEqual(
            invalid_id.schema_fingerprint["shape_sha256"],
            inconsistent_id.schema_fingerprint["shape_sha256"],
        )
        self.assertEqual(
            invalid_id.schema_fingerprint["parser_state"], "event_id",
        )
        self.assertEqual(
            inconsistent_id.schema_fingerprint["parser_state"],
            "event_id_consistency",
        )
        self.assertNotEqual(invalid_id.trace_code, inconsistent_id.trace_code)

    def test_oversize_invalid_json_and_partial_event_fail_closed(self) -> None:
        cases = [
            (
                [b"data: " + b"x" * 64 + b"\n"],
                32,
                "forge_entrypoint_response_too_large",
            ),
            (
                [*event("{")],
                8192,
                "forge_entrypoint_response_invalid",
            ),
            (
                [b'data: {"id":"unterminated"}\n'],
                8192,
                "forge_entrypoint_response_incomplete",
            ),
        ]
        for lines, cap, expected in cases:
            with self.subTest(expected=expected):
                result, journal, error = self.read(lines, response_cap=cap)
                self.assertIsNone(result)
                self.assertEqual(error, expected)
                self.assertEqual(journal, [])

    def test_stop_without_content_is_rejected(self) -> None:
        lines = [
            *event(role_chunk()),
            *event(chunk(content="", finish_reason="stop")),
            *event(usage_chunk()),
            *event("[DONE]"),
        ]
        result, journal, error = self.read(lines)
        self.assertIsNone(result)
        self.assertEqual(error, "forge_entrypoint_response_text_missing")
        self.assertEqual(journal, ["response_body_complete"])


if __name__ == "__main__":
    unittest.main()
