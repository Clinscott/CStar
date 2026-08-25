from pathlib import Path

from src.core.annex import HeimdallWarden


def test_annex_path_filter_remains_detached():
    assert HeimdallWarden._should_ignore(Path("repo/.git/config")) is True
    assert HeimdallWarden._should_ignore(Path("repo/src/main.py")) is False
