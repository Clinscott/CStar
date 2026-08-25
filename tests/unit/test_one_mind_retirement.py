from __future__ import annotations

import asyncio
from pathlib import Path

from src.core.intelligence_contract import normalize_intelligence_request
from src.core.mimir_client import MimirClient
from src.core.one_mind_bridge import resolve_one_mind_decision


def _request(source: str = "test-suite", *, transport_mode: str = "auto"):
    return normalize_intelligence_request(
        {
            "prompt": "Inspect the retired boundary.",
            "transport_mode": transport_mode,
            "caller": {"source": source},
        },
        default_source="test-suite",
    )


def test_retired_broker_flag_cannot_change_primary_transport() -> None:
    decision = resolve_one_mind_decision(
        _request(),
        {
            "CODEX_SHELL": "1",
            "CODEX_THREAD_ID": "thread-1",
            "CORVUS_ONE_MIND_BROKER_ACTIVE": "1",
        },
        broker_active=True,
    )

    assert decision.execution_allowed is True
    assert decision.transport_mode == "host_session"
    assert decision.reason == "interactive-host-session-direct"


def test_subagent_boundary_is_denied_before_explicit_transport() -> None:
    decision = resolve_one_mind_decision(
        _request("runtime:host-worker", transport_mode="host_session"),
        {"CODEX_SHELL": "1", "CODEX_THREAD_ID": "thread-1"},
    )

    assert decision.execution_allowed is False
    assert decision.transport_mode == "synapse_db"
    assert decision.reason == "retired-subagent-execution-boundary"


def test_python_mimir_rejects_subagent_without_host_or_synapse_actuation(tmp_path: Path) -> None:
    calls = {"host": 0, "oracle": 0}

    def host_runner(_prompt: str, _provider: str) -> str:
        calls["host"] += 1
        return "unexpected"

    def oracle_runner(_synapse_id: int) -> None:
        calls["oracle"] += 1

    client = MimirClient(
        project_root=tmp_path,
        env={"CODEX_SHELL": "1", "CODEX_THREAD_ID": "thread-1"},
        host_session_runner=host_runner,
        oracle_runner=oracle_runner,
    )
    response = asyncio.run(
        client.request(
            {
                "prompt": "Implement through the retired subagent lane.",
                "transport_mode": "host_session",
                "caller": {"source": "runtime:host-worker"},
                "metadata": {
                    "one_mind_boundary": "subagent",
                    "execution_role": "subagent",
                },
            }
        )
    )

    assert response.status == "error"
    assert "delegated execution is retired" in (response.error or "").lower()
    assert calls == {"host": 0, "oracle": 0}
    assert not (tmp_path / ".stats").exists()


def test_python_mimir_no_longer_reads_historical_broker_table() -> None:
    source = Path("src/core/mimir_client.py").read_text(encoding="utf-8")

    assert "hall_one_mind_broker" not in source
    assert "_read_hall_broker_active" not in source
    assert "interactive-host-session-bus" not in source
