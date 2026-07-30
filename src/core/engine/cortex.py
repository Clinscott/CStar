"""Pure document-section parsing and a retired project-polling Cortex runtime."""

from __future__ import annotations

import re
from pathlib import Path
from typing import NoReturn


LEGACY_CORTEX_RUNTIME_ERROR = (
    "legacy_python_cortex_runtime_retired_use_bounded_cstar_hall_search"
)
MAX_CORTEX_DOCUMENT_BYTES = 1024 * 1024


def parse_cortex_sections(
    name: str,
    content: str,
    *,
    max_bytes: int = MAX_CORTEX_DOCUMENT_BYTES,
) -> list[tuple[str, str]]:
    """Parse caller-supplied text into sections without filesystem discovery."""
    if max_bytes < 0 or len(content.encode("utf-8")) > max_bytes:
        raise ValueError(f"Cortex content exceeds explicit byte limit for {name}.")

    current_header = f"{name} > Intro"
    digested: list[tuple[str, str]] = []
    buffer: list[str] = []

    def flush() -> None:
        chunk = "\n".join(buffer).strip()
        if chunk:
            digested.append((current_header, chunk))
        buffer.clear()

    for line in content.splitlines():
        if re.match(r"^#+ ", line):
            flush()
            current_header = f"{name} > {line.lstrip('#').strip()}"
        else:
            buffer.append(line)
    flush()
    return digested


class Cortex:
    """Import-compatible tombstone for autonomous document ingestion and polling."""

    parse_sections = staticmethod(parse_cortex_sections)

    def __init__(
        self,
        project_root: str | Path,
        base_path: str | Path,
    ) -> NoReturn:
        del project_root, base_path
        raise RuntimeError(LEGACY_CORTEX_RUNTIME_ERROR)
