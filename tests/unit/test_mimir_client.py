import sqlite3
import subprocess

import pytest

from src.core.mimir_client import MimirClient


def _read_prompt(db_path, synapse_id: int) -> str:
    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT prompt FROM synapse WHERE id = ?", (synapse_id,))
        row = cursor.fetchone()
        assert row is not None
        return row[0]


def _complete_prompt(db_path, synapse_id: int, response: str) -> None:
    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE synapse SET response = ?, status = 'COMPLETED' WHERE id = ?",
            (response, synapse_id),
        )
        conn.commit()


@pytest.mark.asyncio
async def test_mimir_client_returns_a_typed_error_when_builtin_gemini_scaffold_yields_no_output(tmp_path, monkeypatch):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    client = MimirClient(project_root=tmp_path, env={}, host_session_active=True)

    response = await client.request(
        {
            "prompt": "Identify the active capability.",
            "system_prompt": "Respond in one line.",
            "caller": {"source": "test-suite"},
        }
    )

    assert response.status == "error"
    assert response.trace.transport_mode == "host_session"
    assert response.error is not None
    assert "gemini returned no output" in response.error.lower()


@pytest.mark.asyncio
async def test_mimir_client_uses_configured_gemini_host_bridge(tmp_path, monkeypatch):
    observed: dict[str, object] = {}

    def fake_run(args, **kwargs):
        observed["args"] = args
        observed["cwd"] = kwargs["cwd"]
        observed["env"] = kwargs["env"]
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="Gemini host response", stderr="")

    monkeypatch.setenv("CORVUS_GEMINI_HOST_BRIDGE_CMD", "gemini")
    monkeypatch.setenv(
        "CORVUS_GEMINI_HOST_BRIDGE_ARGS_JSON",
        '["-p", "{prompt}", "--cwd", "{project_root}"]',
    )
    monkeypatch.setattr(subprocess, "run", fake_run)

    client = MimirClient(
        project_root=tmp_path,
        env={},
        host_session_active=True,
        host_provider="gemini",
    )

    response = await client.request({"prompt": "Explain the active bridge."})

    assert response.status == "success"
    assert response.trace.transport_mode == "host_session"
    assert response.raw_text == "Gemini host response"
    assert observed["args"] == [
        "gemini",
        "-p",
        "Explain the active bridge.",
        "--cwd",
        str(tmp_path),
    ]
    assert observed["cwd"] == str(tmp_path)


@pytest.mark.asyncio
async def test_mimir_client_uses_codex_host_runner_when_provider_is_codex(tmp_path):
    observed: list[tuple[str, str]] = []

    async def host_session_runner(prompt: str, provider: str) -> str:
        observed.append((provider, prompt))
        return "Codex host response"

    client = MimirClient(
        project_root=tmp_path,
        env={},
        host_session_active=True,
        host_provider="codex",
        host_session_runner=host_session_runner,
    )

    response = await client.request({"prompt": "Explain the active bridge."})

    assert response.status == "success"
    assert response.trace.transport_mode == "host_session"
    assert response.raw_text == "Codex host response"
    assert observed == [("codex", "Explain the active bridge.")]


@pytest.mark.asyncio
async def test_mimir_client_uses_builtin_claude_cli_scaffold(tmp_path, monkeypatch):
    observed: dict[str, object] = {}

    def fake_run(args, **kwargs):
        observed["args"] = args
        observed["cwd"] = kwargs["cwd"]
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="Claude host response", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    client = MimirClient(
        project_root=tmp_path,
        env={},
        host_session_active=True,
        host_provider="claude",
    )

    response = await client.request({"prompt": "Explain the active bridge."})

    assert response.status == "success"
    assert response.trace.transport_mode == "host_session"
    assert response.raw_text == "Claude host response"
    assert observed["args"] == ["claude", "-p", "Explain the active bridge."]
    assert observed["cwd"] == str(tmp_path)


@pytest.mark.asyncio
async def test_mimir_client_uses_builtin_gemini_cli_scaffold(tmp_path, monkeypatch):
    observed: dict[str, object] = {}

    def fake_run(args, **kwargs):
        observed["args"] = args
        observed["cwd"] = kwargs["cwd"]
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="Gemini host response", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    client = MimirClient(
        project_root=tmp_path,
        env={},
        host_session_active=True,
        host_provider="gemini",
    )

    response = await client.request({"prompt": "Explain the active bridge."})

    assert response.status == "success"
    assert response.trace.transport_mode == "host_session"
    assert response.raw_text == "Gemini host response"
    assert observed["args"] == ["gemini", "-p", "Explain the active bridge."]
    assert observed["cwd"] == str(tmp_path)


@pytest.mark.asyncio
async def test_mimir_client_prefers_synapse_db_in_auto_mode_for_interactive_codex(tmp_path):
    async def oracle_runner(synapse_id: int) -> None:
        _complete_prompt(
            tmp_path / ".stats" / "synapse.db",
            synapse_id,
            "Codex interactive synapse response",
        )

    client = MimirClient(
        project_root=tmp_path,
        env={"CODEX_SHELL": "1", "CODEX_THREAD_ID": "thread-1"},
        oracle_runner=oracle_runner,
    )

    response = await client.request({"prompt": "Explain the active bridge."})

    assert response.status == "success"
    assert response.trace.transport_mode == "synapse_db"
    assert response.raw_text == "Codex interactive synapse response"


@pytest.mark.asyncio
async def test_mimir_client_prefers_detected_codex_provider_before_gemini_fallback(tmp_path):
    observed: list[tuple[str, str]] = []

    async def host_session_runner(prompt: str, provider: str) -> str:
        observed.append((provider, prompt))
        return "Codex detected response"

    client = MimirClient(
        project_root=tmp_path,
        env={"CODEX_SHELL": "1", "CODEX_THREAD_ID": "thread-1"},
        host_session_active=True,
        host_session_runner=host_session_runner,
    )

    response = await client.request(
        {
            "prompt": "Explain the detected bridge.",
            "transport_mode": "host_session",
            "caller": {"source": "test-suite"},
        }
    )

    assert response.status == "success"
    assert response.trace.transport_mode == "host_session"
    assert observed == [("codex", "Explain the detected bridge.")]


@pytest.mark.asyncio
async def test_mimir_client_reads_synapse_completion(tmp_path):
    async def oracle_runner(synapse_id: int) -> None:
        prompt = _read_prompt(tmp_path / ".stats" / "synapse.db", synapse_id)
        _complete_prompt(
            tmp_path / ".stats" / "synapse.db",
            synapse_id,
            f"Completed: {prompt}",
        )

    client = MimirClient(
        project_root=tmp_path,
        env={},
        host_session_active=False,
        oracle_runner=oracle_runner,
    )

    response = await client.request({"prompt": "Trace the repository health."})

    assert response.status == "success"
    assert response.trace.transport_mode == "synapse_db"
    assert response.trace.cached is False
    assert response.raw_text == "Completed: Trace the repository health."


@pytest.mark.asyncio
async def test_mimir_client_uses_synapse_cache_before_oracle(tmp_path):
    invoked = False
    db_path = tmp_path / ".stats" / "synapse.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS synapse (
                id INTEGER PRIMARY KEY,
                prompt TEXT,
                response TEXT,
                status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            "INSERT INTO synapse (prompt, response, status) VALUES (?, ?, 'COMPLETED')",
            ("Cached prompt", "Cached response"),
        )
        conn.commit()

    async def oracle_runner(_synapse_id: int) -> None:
        nonlocal invoked
        invoked = True

    client = MimirClient(
        project_root=tmp_path,
        env={},
        host_session_active=False,
        oracle_runner=oracle_runner,
    )

    response = await client.request({"prompt": "Cached prompt"})

    assert response.status == "success"
    assert response.raw_text == "Cached response"
    assert response.trace.cached is True
    assert invoked is False


@pytest.mark.asyncio
async def test_mimir_client_compatibility_wrappers_use_canonical_request(tmp_path):
    async def oracle_runner(synapse_id: int) -> None:
        prompt = _read_prompt(tmp_path / ".stats" / "synapse.db", synapse_id)
        _complete_prompt(tmp_path / ".stats" / "synapse.db", synapse_id, f"OK: {prompt}")

    client = MimirClient(
        project_root=tmp_path,
        env={},
        host_session_active=False,
        oracle_runner=oracle_runner,
    )

    intent = await client.get_file_intent("src/core/engine/vector.py")
    search = await client.search_well("legacy daemon bridge")
    indexed = await client.index_sector("src/core/engine/vector.py")

    assert "src/core/engine/vector.py" in (intent or "")
    assert "legacy daemon bridge" in (search or "")
    assert indexed is True
