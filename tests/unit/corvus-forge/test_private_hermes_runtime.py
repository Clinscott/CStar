from __future__ import annotations

import hashlib
import io
import json
import os
import stat
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[3]
RUNTIME = ROOT / ".agents" / "skills" / "corvus-forge" / "runtime"
sys.path.insert(0, str(RUNTIME))

from hermes_cli import forge_entrypoint, forge_mode  # noqa: E402
from hermes_cli.forge_minimax_oauth import (  # noqa: E402
    ForgeMiniMaxOAuthError, resolve_forge_minimax_oauth,
)


def stable_digest(value: dict[str, object]) -> str:
    encoded = json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("ascii")).hexdigest()


class PrivateRuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="cstar-private-runtime-", dir="/tmp")
        self.root = Path(self.temporary.name)
        os.chmod(self.root, 0o700)
        self.home = self.root / "home"
        profile = self.home / ".hermes" / "profiles" / "cstar-hub"
        for directory in (self.home, self.home / ".hermes", profile.parent, profile):
            directory.mkdir(exist_ok=True)
            os.chmod(directory, 0o700)
        self.profile = profile

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_store(self, expires_at: str) -> None:
        payload = {"providers": {"minimax-oauth": {
            "provider": "minimax-oauth", "region": "global",
            "portal_base_url": "https://api.minimax.io",
            "inference_base_url": "https://api.minimax.io/anthropic",
            "client_id": "78257093-7e40-4613-99e0-527b14b39113",
            "token_type": "Bearer", "scope": "group_id profile model.completion",
            "access_token": "synthetic-oauth-canary", "expires_at": expires_at,
        }}}
        store = self.profile / "auth.json"
        store.write_text(json.dumps(payload), encoding="utf-8")
        os.chmod(store, 0o600)

    def oauth_environment(self) -> dict[str, str]:
        return {"HOME": str(self.home), "HERMES_HOME": str(self.profile)}

    def test_oauth_uses_absolute_horizon_and_status_is_token_free(self) -> None:
        self.write_store("2035-01-01T00:00:00Z")
        now = datetime(2026, 7, 13, 12, 0, tzinfo=timezone.utc)
        required = int(now.timestamp() * 1000) + 2_100_000
        with patch.dict(os.environ, self.oauth_environment(), clear=True):
            credential = resolve_forge_minimax_oauth(
                required_until_unix_ms=required, now=now,
            )
            self.assertEqual(repr(credential), "ForgeMiniMaxOAuthCredential(<redacted>)")
            status = credential.status(
                horizon_started_unix_ms=required - 2_100_000,
                required_until_unix_ms=required,
                horizon_binding_sha256="a" * 64,
            )
        self.assertEqual(status["schema"], "hermes.forge_minimax_oauth_status.v2")
        self.assertEqual(status["required_until_unix_ms"], required)
        self.assertFalse(any(fragment in key for key in status for fragment in (
            "token", "expiry", "ttl", "path", "store",
        )))
        self.assertNotIn("synthetic-oauth-canary", json.dumps(status))

    def test_oauth_fails_closed_when_token_does_not_cover_fixed_horizon(self) -> None:
        self.write_store("2026-07-13T12:30:00Z")
        now = datetime(2026, 7, 13, 12, 0, tzinfo=timezone.utc)
        required = int(now.timestamp() * 1000) + 2_100_000
        with patch.dict(os.environ, self.oauth_environment(), clear=True):
            with self.assertRaisesRegex(
                ForgeMiniMaxOAuthError, "forge_entrypoint_oauth_refresh_required",
            ):
                resolve_forge_minimax_oauth(required_until_unix_ms=required, now=now)

    def initial_journal(self, binding: str) -> Path:
        base = {
            "binding_sha256": binding, "previous_sha256": "0" * 64,
            "schema": "cstar.forge_provider_journal.v1", "sequence": 0,
            "state": "not_reached",
        }
        event = {**base, "event_sha256": stable_digest(base)}
        journal = self.root / "provider-journal.jsonl"
        journal.write_text(json.dumps(event, separators=(",", ":"), sort_keys=True) + "\n",
                           encoding="ascii")
        os.chmod(journal, 0o600)
        return journal

    def provider_environment(self, journal: Path, binding: str) -> dict[str, str]:
        return {
            "CSTAR_FORGE_HERMES_DELEGATED": "1", "HERMES_SAFE_MODE": "1",
            "HERMES_FORGE_EPHEMERAL": "1",
            "CSTAR_FORGE_PROVIDER_JOURNAL_PATH": str(journal),
            "CSTAR_FORGE_PROVIDER_JOURNAL_BINDING_SHA256": binding,
        }

    def reset_mode(self) -> None:
        forge_mode._PROVIDER_REQUESTS_CONSUMED = 0
        forge_mode._ENTRYPOINT_ACTIVE = False

    def test_network_boundaries_advance_and_fsync_token_free_journal(self) -> None:
        binding = "b" * 64; journal = self.initial_journal(binding)
        captured: dict[str, object] = {}

        class Response:
            status = 200
            lines = iter([
                b'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","model":"MiniMax-M3","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n',
                b'\n',
                b'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","model":"MiniMax-M3","choices":[{"index":0,"delta":{"reasoning_content":"bounded reasoning"},"finish_reason":null}]}\n',
                b'\n',
                b'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","model":"MiniMax-M3","choices":[{"index":0,"delta":{"content":"boun"},"finish_reason":null}]}\n',
                b'\n',
                b'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","model":"MiniMax-M3","choices":[{"index":0,"delta":{"content":"ded"},"finish_reason":"stop"}]}\n',
                b'\n',
                b'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","model":"MiniMax-M3","choices":[],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n',
                b'\n',
                b'data: [DONE]\n',
                b'\n',
            ])
            def getheader(self, _name: str, _default: str = "") -> str:
                return "text/event-stream; charset=utf-8"
            def readline(self, _size: int) -> bytes:
                return next(self.lines, b"")
            def close(self) -> None: pass

        class Connection:
            def __init__(self, *_args, **_kwargs): pass
            def request(self, method: str, path: str, *, body: bytes, headers: dict[str, str]) -> None:
                captured.update({"method": method, "path": path, "body": body, "headers": headers})
            def getresponse(self) -> Response: return Response()
            def close(self) -> None: pass

        self.reset_mode()
        with patch.dict(os.environ, self.provider_environment(journal, binding), clear=True), \
                patch.object(forge_entrypoint.http.client, "HTTPSConnection", Connection), \
                patch.object(forge_entrypoint.ssl, "create_default_context", return_value=object()):
            forge_mode.activate_forge_entrypoint()
            text, usage = forge_entrypoint._request("prompt", "synthetic-bearer", {
                "forge_request_receipt_id": "request-runtime-test",
                "forge_execute_receipt_id": "execute-runtime-test",
                "decision_id": "decision-runtime-test",
                "adapter_ref": "cstar-forge-hermes-minimax-worker-adapter",
                "runtime_content_sha256": "c" * 64,
                "role_plan_id": "bounded-six-role-manifest-v1",
                "role_plan_sha256": "d" * 64, "forge_role": "specifier",
                "forge_phase": "1/6", "input_handoff_sha256": "0" * 64,
                "specification_handoff_sha256": "0" * 64,
            })
        self.assertEqual((text, usage), ("bounded", {"input_tokens": 1, "output_tokens": 2}))
        request_body = json.loads(bytes(captured["body"]).decode("utf-8"))
        self.assertEqual((captured["method"], captured["path"]), ("POST", "/v1/chat/completions"))
        self.assertIs(request_body["stream"], True)
        self.assertEqual(request_body["stream_options"], {"include_usage": True})
        self.assertEqual(request_body["reasoning_split"], True)
        self.assertEqual(request_body["model"], "MiniMax-M3")
        self.assertEqual(request_body["max_completion_tokens"], 2048)
        self.assertIn("smallest valid minified JSON", request_body["messages"][0]["content"])
        self.assertIn("Emit no reasoning", request_body["messages"][0]["content"])
        self.assertNotIn("max_tokens", request_body)
        self.assertEqual(captured["headers"]["accept"], "text/event-stream")
        self.assertNotIn("anthropic-version", captured["headers"])
        self.assertNotIn("anthropic-beta", captured["headers"])
        events = [json.loads(line) for line in journal.read_text(encoding="ascii").splitlines()]
        self.assertEqual([item["state"] for item in events], [
            "not_reached", "capability_consumed", "dispatch_attempted", "request_sent",
            "response_headers_received", "response_body_complete",
        ])
        self.assertEqual(stat.S_IMODE(journal.stat().st_mode), 0o600)
        self.assertNotIn("synthetic-bearer", journal.read_text(encoding="ascii"))

    def test_main_emits_only_bounded_schema_fingerprint_trace_code(self) -> None:
        shape_hash = "a" * 64
        trace_code = f"forge_entrypoint_response_schema_invalid_obj_{shape_hash}"
        failure = forge_entrypoint.ForgeEntrypointError(
            "forge_entrypoint_response_schema_invalid",
            trace_code=trace_code,
            schema_fingerprint={
                "parser_state": "payload_object",
                "shape_sha256": shape_hash,
            },
        )
        stderr = io.StringIO()
        with patch.object(
            forge_entrypoint, "_require_execution_context", return_value={},
        ), patch.object(
            forge_entrypoint, "_read_prompt", return_value="synthetic-prompt-canary",
        ), patch.object(
            forge_entrypoint, "_read_oauth_credential",
            return_value="synthetic-credential-canary",
        ), patch.object(
            forge_entrypoint, "activate_forge_entrypoint",
        ), patch.object(
            forge_entrypoint, "_request", side_effect=failure,
        ), redirect_stderr(stderr):
            status = forge_entrypoint.main(forge_entrypoint._EXECUTE_ARGV)
        self.assertEqual(status, 1)
        self.assertEqual(stderr.getvalue(), f"{trace_code}\n")
        self.assertNotIn("synthetic-prompt-canary", stderr.getvalue())
        self.assertNotIn("synthetic-credential-canary", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
