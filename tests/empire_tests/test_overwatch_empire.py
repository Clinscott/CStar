from src.tools.overwatch import StatsCollector


def test_stats_collector_logic(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    base = tmp_path / "base"
    base.mkdir()

    db_path = root / "fishtest_data.json"
    db_path.write_text("not-read", encoding="utf-8")

    collector = StatsCollector(str(root), str(base))
    stats = collector.collect()

    assert stats == {"cases": 0, "rejections": 0, "war_zones": 0}
    assert db_path.read_text(encoding="utf-8") == "not-read"

def test_stats_collector_missing(tmp_path):
    collector = StatsCollector(str(tmp_path / "root"), str(tmp_path / "base"))
    stats = collector.collect()
    assert stats == {"cases": 0, "rejections": 0, "war_zones": 0}
