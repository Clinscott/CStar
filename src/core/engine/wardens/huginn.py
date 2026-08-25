"""Deterministic trace checks for repeated headings and temporary-path leaks."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from src.core.engine.wardens.base import BaseWarden


class HuginnWarden(BaseWarden):
    """Read project-local Markdown traces without provider or secret access."""

    MAX_TRACE_FILES = 256
    MAX_TRACE_BYTES = 512 * 1024

    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.trace_dir = root / ".agents" / "traces"

    def scan(self) -> list[dict[str, Any]]:
        if not self.trace_dir.exists() or self.trace_dir.is_symlink() or not self.trace_dir.is_dir():
            return []
        return self._scan_regex()

    def _scan_regex(self) -> list[dict[str, Any]]:
        targets: list[dict[str, Any]] = []
        for trace_file in sorted(self.trace_dir.glob("*.md"))[: self.MAX_TRACE_FILES]:
            try:
                stat = trace_file.lstat()
                if (
                    trace_file.is_symlink()
                    or not trace_file.is_file()
                    or stat.st_nlink != 1
                    or stat.st_size > self.MAX_TRACE_BYTES
                ):
                    continue
                content = trace_file.read_text(encoding="utf-8")
            except (OSError, UnicodeError):
                continue
            headers = [line.strip() for line in content.splitlines() if line.strip().startswith("# ")]
            for header in set(headers):
                if headers.count(header) >= 3:
                    targets.append({
                        "type": "HALLUCINATION_REPEATED_HEADER",
                        "file": str(trace_file.relative_to(self.root)),
                        "action": "Repeated Markdown header detected",
                        "severity": "MEDIUM",
                        "line": 1,
                    })
                    break

            temp_paths = re.findall(
                r"(/tmp/[a-zA-Z0-9_\-./]+|C:\\Users\\.*\\AppData\\Local\\Temp\\[a-zA-Z0-9_\-./]+)",
                content,
            )
            for temp_path in temp_paths:
                if "pytest" not in temp_path:
                    targets.append({
                        "type": "DEVIANCE_TEMP_PATH",
                        "file": str(trace_file.relative_to(self.root)),
                        "action": f"Suspicious temporary path detected: {temp_path}",
                        "severity": "HIGH",
                        "line": 1,
                    })
        return targets
