"""
[EMPIRE TDD] Host-session decoupling verification
Lore: "Verifying the severed strings of the Gungnir Calculus."
Standard: Linscott Standard (Atomic Code/Verification)
"""

from __future__ import annotations

import sys
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.uplink import AntigravityUplink
from src.core.engine.wardens.huginn import HuginnWarden


@pytest.mark.asyncio
async def test_uplink_returns_structured_bridge_response() -> None:
    with patch("src.cstar.core.uplink.mimir.request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = type(
            "Response",
            (),
            {
                "status": "success",
                "raw_text": "Shared bridge response",
                "error": None,
                "trace": type(
                    "Trace",
                    (),
                    {
                        "correlation_id": "uplink-test",
                        "transport_mode": "host_session",
                        "cached": False,
                    },
                )(),
            },
        )()

        uplink = AntigravityUplink()
        response = await uplink.send_payload("Test Query", {"persona": "ODIN"})

        assert response["status"] == "success"
        assert response["data"]["raw"] == "Shared bridge response"
        assert response["trace"]["transport_mode"] == "host_session"


def test_bootstrap_preserves_host_markers() -> None:
    from src.core import bootstrap as bootstrap_module

    with patch.dict(
        "os.environ",
        {
            "CODEX_SHELL": "1",
            "CODEX_THREAD_ID": "thread-1",
            "CORVUS_HOST_PROVIDER": "codex",
            "CORVUS_HOST_SESSION_ACTIVE": "true",
        },
        clear=False,
    ):
        bootstrap_module._BOOTSTRAPPED = False
        bootstrap_module.SovereignBootstrap.execute()

        assert os.environ["CODEX_SHELL"] == "1"
        assert os.environ["CODEX_THREAD_ID"] == "thread-1"
        assert os.environ["CORVUS_HOST_PROVIDER"] == "codex"
        assert os.environ["CORVUS_HOST_SESSION_ACTIVE"] == "true"


@pytest.mark.asyncio
async def test_huginn_pending_bridge_response_returns_no_targets() -> None:
    trace_dir = project_root / ".agents" / "traces"
    trace_dir.mkdir(parents=True, exist_ok=True)
    dummy_trace = trace_dir / "test_trace.md"
    dummy_trace.write_text("Dummy trace content", encoding="utf-8")

    try:
        with patch("src.cstar.core.uplink.AntigravityUplink.send_payload", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {"status": "pending"}
            warden = HuginnWarden(project_root)
            results = await warden._scan_neural_async(dummy_trace)

            mock_send.assert_awaited_once()
            assert results == []
    finally:
        dummy_trace.unlink(missing_ok=True)
