from pathlib import Path

from src.skills.local.CacheBro.cache_bro import CacheBro


def test_missing_cache_loads_empty_without_writing(tmp_path: Path) -> None:
    cache = CacheBro.__new__(CacheBro)
    cache.cache_file = tmp_path / "cachebro.json"

    assert cache._load_cache() == {}
    assert not cache.cache_file.exists()
