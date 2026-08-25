#!/usr/bin/env python3
"""Retired federated directory watcher and trace ingestion pipeline."""

from __future__ import annotations

from pathlib import Path


RETIRED_ERROR = "legacy_network_watcher_retired_use_cstar_kernel_receipts"

THEMES = {
    "ODIN": {"TITLE": "retired", "DETECTED": "retired", "PASS": "retired", "FAIL": "retired"},
    "ALFRED": {"TITLE": "retired", "DETECTED": "retired", "PASS": "retired", "FAIL": "retired"},
}


class CruciblePipeline:
    """Preserve lexical path fields while disabling ingestion and mutation."""

    def __init__(self, root: str, base: str) -> None:
        self.root = root
        self.base = base
        base_path = Path(base)
        self.stage = str(base_path / "traces" / "staging")
        self.proc = str(base_path / "traces" / "processed")
        self.quar = str(base_path / "traces" / "quarantine")
        self.db = str(Path(root) / "fishtest_data.json")

    @staticmethod
    def get_theme() -> dict[str, str]:
        return dict(THEMES["ALFRED"])

    @staticmethod
    def log_rejection(filename: str, reason: str) -> None:
        return None

    def process(self, file_path: str) -> None:
        raise RuntimeError(RETIRED_ERROR)


class NetworkWatcher:
    """No persistent loop or directory polling remains."""

    def __init__(self, share_path: str, pipeline: CruciblePipeline) -> None:
        self.share = share_path
        self.pipeline = pipeline

    def watch(self) -> None:
        raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
