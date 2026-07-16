from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_hall_database_cache_boundary_is_documented() -> None:
    documentation = (ROOT / "docs/operations/hall-database-handle-cache-boundary.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_hall_database_handle_cache_boundary.feature").read_text(
        encoding="utf-8"
    )
    assert "at most eight distinct canonical" in documentation
    assert "hall_database_root_cache_limit_exceeded" in documentation
    assert "creating a `.stats` directory" in documentation
    assert "Connections are not evicted implicitly" in documentation
    assert "a ninth distinct root fails before a stats directory or SQLite file is created" in feature
