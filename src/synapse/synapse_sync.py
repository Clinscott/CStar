#!/usr/bin/env python3
"""Retired legacy filesystem/Git knowledge synchronization lane.

Knowledge lifecycle is owned by CStar kernel/Hall primitives. The former pull
and push implementation copied files and ran Git operations without remote
authentication; keeping it callable would create a second, unaudited control
plane. Two local data helpers remain for compatibility with historical offline
analysis tests. The CLI and Synapse orchestrator always fail closed.
"""

from __future__ import annotations

import json
import socket
import sys
import time
from pathlib import Path
from typing import Any


RETIRED_REASON = "legacy_synapse_sync_retired_use_cstar_kernel_hall"


class ConfigurationError(RuntimeError):
    """Raised when callers attempt to use the retired Synapse lane."""


class PushRateLimiter:
    """Historical local rate-ledger helper; it grants no sync authority."""

    def __init__(self, core_path: Path) -> None:
        self.path = core_path / ".synapse_rate_limit.json"
        self.client_id = socket.gethostname() or "unknown"
        self.data = self._load()

    def _load(self) -> dict[str, Any]:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                return data.get(self.client_id, {"attempts": [], "locked_until": None})
            except (OSError, json.JSONDecodeError, AttributeError):
                pass
        return {"attempts": [], "locked_until": None}

    def _save(self) -> None:
        try:
            full: dict[str, Any] = {}
            if self.path.exists():
                full = json.loads(self.path.read_text(encoding="utf-8"))
            full[self.client_id] = self.data
            self.path.write_text(json.dumps(full, indent=2), encoding="utf-8")
        except (OSError, json.JSONDecodeError):
            pass

    def check(self) -> tuple[bool, str]:
        now = time.time()
        locked_until = self.data.get("locked_until")
        if locked_until and now < locked_until:
            return False, f"Locked for {int((locked_until - now) / 60)}m"
        self.data["attempts"] = [attempt for attempt in self.data["attempts"] if attempt > now - 3600]
        if len(self.data["attempts"]) >= 10:
            self.data["locked_until"] = now + 1800
            self._save()
            return False, "Rate limit exceeded (10 pushes/hr)"
        return True, "OK"

    def record(self, success: bool) -> None:
        now = time.time()
        self.data["attempts"].append(now)
        if not success:
            self.data["attempts"].append(now)
        self._save()


class KnowledgeExtractor:
    """Historical read-only extractor; output is not a lifecycle transition."""

    def __init__(self, project_root: Path, agent_dir: Path) -> None:
        self.root = project_root
        self.agent = agent_dir
        self.corrections_path = agent_dir / "corrections.json"
        self.trace_dir = agent_dir / "traces" / "processed"

    def extract_all(self) -> list[dict[str, Any]]:
        return self._extract_corrections() + self._extract_patterns()

    def _extract_corrections(self) -> list[dict[str, Any]]:
        if not self.corrections_path.exists():
            return []
        try:
            data = json.loads(self.corrections_path.read_text(encoding="utf-8"))
            mappings = data.get("phrase_mappings", {})
            return [
                {"type": "correction", "query": query, "target": target}
                for query, target in mappings.items()
                if target and not target.startswith("GLOBAL:")
            ]
        except (OSError, json.JSONDecodeError, AttributeError):
            return []

    def _extract_patterns(self) -> list[dict[str, Any]]:
        if not self.trace_dir.exists():
            return []
        patterns: dict[str, int] = {}
        try:
            for trace in self.trace_dir.glob("*.json"):
                query = json.loads(trace.read_text(encoding="utf-8")).get("query")
                if query:
                    patterns[query] = patterns.get(query, 0) + 1
        except (OSError, json.JSONDecodeError, AttributeError):
            return []
        return [
            {"type": "pattern", "query": query, "freq": count}
            for query, count in patterns.items()
            if count >= 3
        ]


class Synapse:
    """Compatibility tombstone for callers that still import Synapse."""

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        raise ConfigurationError(RETIRED_REASON)


def main() -> None:
    print(RETIRED_REASON, file=sys.stderr)
    raise SystemExit(78)


if __name__ == "__main__":
    main()
