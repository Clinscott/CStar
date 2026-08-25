"""Focused synthetic proof for retired Python ancillary execution surfaces."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from scripts import (
    bootstrap_memory,
    extract_user_style,
    fix_muninn,
    project_beads_to_qmd,
    scout_targets,
    taliesin_karpathy_loop,
)
from src.skills.local.CStarEvolutionWatch.scripts import evolution_watch
from src.skills.local.WildHunt.wild_hunt import RETIRED_ERROR as WILD_HUNT_RETIRED
from src.skills.local.WildHunt.wild_hunt import WildHunt
from src.tools.acquire import RETIRED_ERROR as ACQUIRE_RETIRED
from src.tools.acquire import SkillAcquirer
from src.tools.archive_consolidator import ArchiveConsolidator
from src.tools.danger_room import RETIRED_ERROR as DANGER_ROOM_RETIRED
from src.tools.danger_room import DangerRoom
from src.tools.overwatch import RETIRED_ERROR as OVERWATCH_RETIRED
from src.tools.overwatch import Overwatch, StatsCollector
from src.tools.perimeter_sweep import RETIRED_ERROR as PERIMETER_RETIRED
from src.tools.perimeter_sweep import PerimeterSweep
from src.tools.utility_belt import RETIRED_ERROR as UTILITY_BELT_RETIRED
from src.tools.utility_belt import UtilityBelt


def test_cross_spoke_and_memory_wrappers_return_or_fail_closed():
    with pytest.raises(RuntimeError, match=taliesin_karpathy_loop.RETIRED_ERROR):
        taliesin_karpathy_loop._resolve_spoke_entrypoint()
    with pytest.raises(RuntimeError, match=bootstrap_memory.RETIRED_ERROR):
        bootstrap_memory.bootstrap()
    assert taliesin_karpathy_loop.main() == 2
    assert bootstrap_memory.main() == 2
    assert project_beads_to_qmd.main() == 2
    assert asyncio.run(extract_user_style.main()) == 2


def test_source_rewriters_and_scout_leave_synthetic_tree_unchanged(tmp_path):
    source = tmp_path / "source.py"
    source.write_text("value = 1\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match=fix_muninn.RETIRED_ERROR):
        fix_muninn.standardize_muninn(source)
    with pytest.raises(RuntimeError, match=scout_targets.RETIRED_ERROR):
        scout_targets.scout()
    assert source.read_text(encoding="utf-8") == "value = 1\n"
    assert list(tmp_path.iterdir()) == [source]


def test_wild_hunt_keeps_only_pure_trust_classifier():
    hunter = WildHunt()
    assert hunter.is_trusted("https://github.com/google/example") is True
    assert hunter.is_trusted("https://example.invalid/repo") is False
    with pytest.raises(RuntimeError, match=WILD_HUNT_RETIRED):
        hunter.search("local")
    with pytest.raises(RuntimeError, match=WILD_HUNT_RETIRED):
        hunter.ingest("https://example.invalid/repo", "synthetic")


def test_evolution_watch_import_and_inspection_are_inert():
    assert evolution_watch.inspect_cstar() == []
    assert evolution_watch.severity_badge("P1") == "[CRITICAL]"
    with pytest.raises(RuntimeError, match=evolution_watch.RETIRED_ERROR):
        evolution_watch.run_research([])
    assert evolution_watch.main() == 2


def test_skill_acquirer_keeps_only_pure_slugifier():
    assert SkillAcquirer._slugify("Safe Synthetic Skill!") == "safe_synthetic_skill"
    with pytest.raises(RuntimeError, match=ACQUIRE_RETIRED):
        asyncio.run(SkillAcquirer.hunt_and_forge("synthetic"))


def test_archive_consolidator_keeps_only_pure_complexity_classifier():
    tool = ArchiveConsolidator("/synthetic")
    assert tool._get_complexity("if value:\n    pass\n") == 2.0
    with pytest.raises(RuntimeError):
        tool._get_git_churn()
    with pytest.raises(RuntimeError):
        tool.analyze()


def test_provider_backed_source_tools_are_inert(tmp_path):
    room = DangerRoom()
    assert room._clean_markdown("```python\nvalue = 1\n```") == "value = 1"
    with pytest.raises(RuntimeError, match=DANGER_ROOM_RETIRED):
        asyncio.run(room.execute())

    belt = UtilityBelt(str(tmp_path / "source.py"))
    assert belt._clean_markdown("```python\nvalue = 1\n```") == "value = 1"
    with pytest.raises(RuntimeError, match=UTILITY_BELT_RETIRED):
        asyncio.run(belt.execute())
    assert list(tmp_path.iterdir()) == []


def test_cleanup_audit_and_overwatch_are_inert(tmp_path):
    sweep = PerimeterSweep(str(tmp_path), purge=True)
    with pytest.raises(RuntimeError, match=PERIMETER_RETIRED):
        sweep.analyze()
    assert list(tmp_path.iterdir()) == []

    assert StatsCollector(str(tmp_path), str(tmp_path)).collect() == {
        "cases": 0,
        "rejections": 0,
        "war_zones": 0,
    }
    with pytest.raises(RuntimeError, match=OVERWATCH_RETIRED):
        Overwatch().run()
