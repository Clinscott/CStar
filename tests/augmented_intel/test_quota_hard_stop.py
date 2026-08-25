from __future__ import annotations

from pathlib import Path

import pytest

from src.tools.brave_search import (
    RETIRED_PYTHON_SOURCE_TOOL_ERROR,
    BraveSearch,
)


@pytest.mark.parametrize(
    "action",
    (
        lambda searcher: searcher._ensure_quota_ledger(),
        lambda searcher: searcher._read_ledger(),
        lambda searcher: searcher._save_ledger({"synthetic": True}),
        lambda searcher: searcher._increment_quota(),
        lambda searcher: searcher.is_quota_available(),
        lambda searcher: searcher.search("synthetic query"),
        lambda searcher: searcher.search_knowledge("synthetic topic"),
    ),
)
def test_retired_search_and_quota_actions_fail_without_filesystem_effects(
    action,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("BRAVE_API_KEY", "synthetic-source-canary")
    searcher = BraveSearch()

    with pytest.raises(RuntimeError, match=f"^{RETIRED_PYTHON_SOURCE_TOOL_ERROR}$"):
        action(searcher)

    assert list(tmp_path.rglob("*")) == []
