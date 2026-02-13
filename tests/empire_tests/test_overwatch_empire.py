import pytest
import json
import os
from src.tools.overwatch import StatsCollector

def test_stats_collector_logic(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    base = tmp_path / "base"
    base.mkdir()
    
    db_path = root / "fishtest_data.json"
    db_content = {
        "test_cases": [
            {"query": "a", "tags": ["ODIN", "ALFRED"]},
            {"query": "b", "tags": ["ALFRED"]},
            {"query": "c", "tags": ["ODIN"]}
        ]
    }
    db_path.write_text(json.dumps(db_content), encoding='utf-8')
    
    quar_dir = base / "traces" / "quarantine"
    quar_dir.mkdir(parents=True)
    rej_path = quar_dir / "REJECTIONS.qmd"
    rej_path.write_text("header\n\n\n- rej1\n- rej2\n", encoding='utf-8')
    
    collector = StatsCollector(str(root), str(base))
    stats = collector.collect()
    
    assert stats["cases"] == 3
    assert stats["war_zones"] == 1
    # rejections logic: max(0, len(lines) - 3)
    # lines: ["header", "\n", "\n", "- rej1\n", "- rej2\n"] (len 5)
    # stats["rejections"] = 5 - 3 = 2
    assert stats["rejections"] == 2

def test_stats_collector_missing(tmp_path):
    collector = StatsCollector(str(tmp_path / "root"), str(tmp_path / "base"))
    stats = collector.collect()
    assert stats == {"cases": 0, "rejections": 0, "war_zones": 0}
