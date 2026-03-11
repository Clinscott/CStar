"""
[Ω] Mimir Client: Canonical Intelligence Bridge
Purpose: Provide a single Python-side contract for Host Session and Synapse DB sampling.
"""

from __future__ import annotations

import asyncio
import inspect
import os
import sqlite3
import subprocess
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from src.core.host_session import HostProvider, is_host_session_active, resolve_host_provider
from src.core.intelligence_contract import (
    IntelligenceRequest,
    IntelligenceResponse,
    build_effective_prompt,
    build_intelligence_error,
    build_intelligence_success,
    normalize_intelligence_request,
)

OracleRunner = Callable[[int], Awaitable[None] | None]
HostSessionRunner = Callable[[str, HostProvider], Awaitable[str] | str]


class MimirClient:
    """Canonical Python bridge for Corvus Star intelligence requests."""

    def __init__(
        self,
        project_root: Path | None = None,
        *,
        host_session_active: bool | None = None,
        host_provider: HostProvider | None = None,
        host_session_runner: HostSessionRunner | None = None,
        oracle_runner: OracleRunner | None = None,
        poll_interval: float = 0.1,
        poll_attempts: int = 20,
    ) -> None:
        self.project_root = project_root or Path(__file__).resolve().parent.parent.parent
        self.db_path = self.project_root / ".agents" / "synapse.db"
        self.host_session_active = host_session_active
        self.host_provider = host_provider
        self.host_session_runner = host_session_runner
        self.oracle_runner = oracle_runner
        self.poll_interval = poll_interval
        self.poll_attempts = poll_attempts

    async def request(self, payload: IntelligenceRequest | dict[str, Any]) -> IntelligenceResponse:
        request = normalize_intelligence_request(payload, default_source="python:mimir")
        transport_mode = self._resolve_transport_mode(request)

        if transport_mode == "host_session":
            return await self._request_via_host_session(request)

        return await self._request_via_synapse(request)

    async def think(self, query: str, system_prompt: str | None = None) -> str | None:
        response = await self.request(
            {
                "prompt": query,
                "system_prompt": system_prompt,
                "caller": {"source": "python:mimir:think"},
            }
        )
        return response.raw_text if response.status == "success" else None

    async def get_file_intent(self, filepath: str) -> str | None:
        response = await self.request(
            {
                "prompt": f"What is the intent of sector: {filepath}?",
                "caller": {
                    "source": "python:mimir:get_file_intent",
                    "sector_path": filepath,
                },
            }
        )
        return response.raw_text if response.status == "success" else None

    async def search_well(self, query: str) -> str | None:
        response = await self.request(
            {
                "prompt": f"Search Mimir's Well for sectors relevant to: {query}",
                "caller": {
                    "source": "python:mimir:search_well",
                    "workflow": "mimirs_well",
                },
                "metadata": {"query": query},
            }
        )
        return response.raw_text if response.status == "success" else None

    async def index_sector(self, filepath: str) -> bool:
        response = await self.request(
            {
                "prompt": f"Index sector: {filepath}",
                "caller": {
                    "source": "python:mimir:index_sector",
                    "sector_path": filepath,
                },
                "metadata": {"filepath": filepath},
            }
        )
        return response.status == "success"

    async def call_tool(self, server: str, tool: str, args: dict[str, Any] | None = None) -> Any:
        raise RuntimeError(
            "[BASELINE_RESTRICTION] MCP tool bridge is not part of the canonical intelligence contract."
        )

    async def close(self) -> None:
        return None

    def _resolve_transport_mode(self, request: IntelligenceRequest) -> str:
        if request.transport_mode == "host_session":
            return "host_session"
        if request.transport_mode == "synapse_db":
            return "synapse_db"

        if self.host_session_active is not None:
            return "host_session" if self.host_session_active else "synapse_db"

        return "host_session" if is_host_session_active(dict(os.environ)) else "synapse_db"

    async def _request_via_host_session(self, request: IntelligenceRequest) -> IntelligenceResponse:
        effective_prompt = build_effective_prompt(request)
        provider = self._resolve_host_provider()

        if provider == "codex":
            try:
                raw_text = await self._invoke_host_session(effective_prompt, provider)
                return build_intelligence_success(request, raw_text, "host_session")
            except Exception as exc:
                return build_intelligence_error(
                    request,
                    f"Host session invocation failed: {exc}",
                    "host_session",
                )

        raw_text = f"[SAMPLING_REQUEST]\n{effective_prompt}"
        return build_intelligence_success(request, raw_text, "host_session")

    def _resolve_host_provider(self) -> HostProvider:
        if self.host_provider is not None:
            return self.host_provider
        if self.host_session_active is True:
            return "gemini"
        return resolve_host_provider(dict(os.environ)) or "gemini"

    async def _invoke_host_session(self, prompt: str, provider: HostProvider) -> str:
        if self.host_session_runner is not None:
            result = self.host_session_runner(prompt, provider)
            if inspect.isawaitable(result):
                result = await result
            normalized = str(result or "").strip()
            if normalized:
                return normalized
            raise RuntimeError(f"Host provider {provider} returned no output.")

        if provider != "codex":
            return f"[SAMPLING_REQUEST]\n{prompt}"

        completed = await asyncio.to_thread(
            subprocess.run,
            ["codex", "exec", prompt],
            cwd=str(self.project_root),
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ},
        )
        if completed.returncode != 0:
            stderr = completed.stderr.strip() or completed.stdout.strip() or "Unknown codex failure."
            raise RuntimeError(stderr)

        response = completed.stdout.strip()
        if not response:
            raise RuntimeError("Codex returned no output.")
        return response

    async def _request_via_synapse(self, request: IntelligenceRequest) -> IntelligenceResponse:
        effective_prompt = build_effective_prompt(request)
        self._ensure_db()

        cached = self._read_cached_response(effective_prompt)
        if cached is not None:
            return build_intelligence_success(request, cached, "synapse_db", cached=True)

        synapse_id = self._create_pending_prompt(effective_prompt)

        try:
            await self._invoke_oracle(synapse_id)
        except Exception as exc:
            return build_intelligence_error(
                request,
                f"Oracle invocation failed: {exc}",
                "synapse_db",
            )

        for _ in range(self.poll_attempts):
            row = self._read_synapse_row(synapse_id)
            if row and row["status"] == "COMPLETED" and row["response"]:
                return build_intelligence_success(request, row["response"], "synapse_db")
            await asyncio.sleep(self.poll_interval)

        return build_intelligence_error(
            request,
            "Timed out waiting for synapse response.",
            "synapse_db",
        )

    async def _invoke_oracle(self, synapse_id: int) -> None:
        if self.oracle_runner is not None:
            result = self.oracle_runner(synapse_id)
            if inspect.isawaitable(result):
                await result
            return

        cstar_ts = self.project_root / "cstar.ts"
        completed = await asyncio.to_thread(
            subprocess.run,
            ["npx", "tsx", str(cstar_ts), "oracle", str(synapse_id), "--db", "--silent"],
            cwd=str(self.project_root),
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ},
        )

        if completed.returncode != 0:
            stderr = completed.stderr.strip() or completed.stdout.strip() or "Unknown oracle failure."
            raise RuntimeError(stderr)

    def _ensure_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(self.db_path)) as conn:
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

    def _read_cached_response(self, prompt: str) -> str | None:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT response FROM synapse WHERE prompt = ? AND status = 'COMPLETED' ORDER BY id DESC",
                (prompt,),
            )
            row = cursor.fetchone()
            return row[0] if row and row[0] else None

    def _create_pending_prompt(self, prompt: str) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO synapse (prompt, status) VALUES (?, ?)",
                (prompt, "PENDING"),
            )
            conn.commit()
            return int(cursor.lastrowid)

    def _read_synapse_row(self, synapse_id: int) -> dict[str, Any] | None:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT response, status FROM synapse WHERE id = ?",
                (synapse_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {"response": row[0], "status": row[1]}


mimir = MimirClient()


def _parse_cli_args(argv: list[str]) -> tuple[str, str | None]:
    if not argv:
        return "Handshake", None

    query = argv[0]
    system_prompt = None
    if "--system_prompt" in argv:
        index = argv.index("--system_prompt")
        if index + 1 < len(argv):
            system_prompt = argv[index + 1]
    return query, system_prompt


async def _main(argv: list[str]) -> int:
    query, system_prompt = _parse_cli_args(argv)
    response = await mimir.request(
        {
            "prompt": query,
            "system_prompt": system_prompt,
            "caller": {"source": "python:mimir:cli"},
        }
    )
    if response.status == "success" and response.raw_text is not None:
        print(response.raw_text)
        return 0

    print(response.error or "The One Mind returned no intelligence.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main(sys.argv[1:])))
