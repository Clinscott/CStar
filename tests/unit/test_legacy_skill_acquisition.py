from __future__ import annotations

from pathlib import Path

import pytest

from src.skills.local.KnowledgeHunter.hunter import (
    KnowledgeHunter,
    KnowledgeHunterDecommissioned,
)
from src.skills.local.SkillLearning.learn import (
    SkillLearner,
    SkillLearningDecommissioned,
)
from src.skills.local.WildHunt.wild_hunt import (
    SkillIngestionDecommissioned,
    WildHunt,
)
from src.tools.acquire import SkillAcquirer, SkillAcquisitionDecommissioned
from src.tools.loop import (
    LegacyExecutionLaneDecommissioned,
    SovereignForge,
    SovereignLifecycle,
)
from src.tools.brave_search import BraveSearch
from src.tools.gemini_search import GeminiSearch
from src.tools.danger_room import DangerRoom, LegacyMutationLaneDecommissioned
from src.tools.utility_belt import UtilityBelt
from src.tools.wrap_it_up import SovereignWrapper


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.asyncio
async def test_direct_acquirer_rejects_without_writing(tmp_path: Path) -> None:
    before = list(tmp_path.iterdir())

    with pytest.raises(SkillAcquisitionDecommissioned, match="decommissioned"):
        await SkillAcquirer.hunt_and_forge("download and install a skill", "unsafe")

    assert list(tmp_path.iterdir()) == before


def test_interactive_skill_learning_rejects_before_prompting() -> None:
    with pytest.raises(SkillLearningDecommissioned, match="decommissioned"):
        SkillLearner.execute()


def test_wild_hunt_preserves_read_only_local_search_and_rejects_ingest(
    tmp_path: Path,
) -> None:
    active = tmp_path / ".agents" / "skills"
    reference = tmp_path / "skills_db"
    (active / "safe-active").mkdir(parents=True)
    (reference / "safe-reference").mkdir(parents=True)
    retired = active / "safe-retired"
    retired.mkdir()
    (retired / "DECOMMISSIONED.md").write_text("# retired\n", encoding="utf-8")
    (active / ".hidden-safe").mkdir()
    (active / "safe-link").symlink_to(active / "safe-active", target_is_directory=True)

    hunter = WildHunt(tmp_path)
    before = sorted(path.relative_to(tmp_path) for path in tmp_path.rglob("*"))

    assert hunter.search("safe") == [
        "[ACTIVE] safe-active",
        "[REFERENCE] safe-reference",
    ]
    assert hunter.search("   ") == []
    with pytest.raises(SkillIngestionDecommissioned, match="decommissioned"):
        hunter.ingest("https://example.invalid/repo.git", "replacement")

    after = sorted(path.relative_to(tmp_path) for path in tmp_path.rglob("*"))
    assert after == before


@pytest.mark.asyncio
async def test_knowledge_hunter_rejects_direct_research() -> None:
    with pytest.raises(KnowledgeHunterDecommissioned, match="decommissioned"):
        await KnowledgeHunter().hunt("external topic")


def test_direct_autonomous_loop_rejects_generation_and_lifecycle(tmp_path: Path) -> None:
    with pytest.raises(LegacyExecutionLaneDecommissioned, match="decommissioned"):
        SovereignForge(tmp_path).forge_task({"action": "rewrite source"})
    with pytest.raises(LegacyExecutionLaneDecommissioned, match="decommissioned"):
        SovereignLifecycle.execute()
    assert list(tmp_path.iterdir()) == []


def test_tombstones_have_no_network_model_clone_or_write_implementation() -> None:
    paths = [
        PROJECT_ROOT / "src" / "tools" / "acquire.py",
        PROJECT_ROOT / "src" / "tools" / "loop.py",
        PROJECT_ROOT / "src" / "skills" / "local" / "SkillLearning" / "learn.py",
        PROJECT_ROOT / "src" / "skills" / "local" / "WildHunt" / "wild_hunt.py",
        PROJECT_ROOT / "src" / "skills" / "local" / "KnowledgeHunter" / "hunter.py",
        PROJECT_ROOT / "src" / "tools" / "brave_search.py",
        PROJECT_ROOT / "src" / "tools" / "gemini_search.py",
        PROJECT_ROOT / "src" / "tools" / "danger_room.py",
        PROJECT_ROOT / "src" / "tools" / "utility_belt.py",
        PROJECT_ROOT / "src" / "tools" / "wrap_it_up.py",
    ]
    forbidden = (
        "AntigravityUplink(",
        "BraveSearch(",
        "subprocess.run(",
        "shutil.rmtree(",
        ".write_text(",
        "git\", \"clone",
        "requests.get(",
    )

    for path in paths:
        source = path.read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in source, f"{path.relative_to(PROJECT_ROOT)} contains {token}"


def test_direct_search_compatibility_surfaces_are_non_actuating(tmp_path: Path) -> None:
    before = list(tmp_path.iterdir())
    assert BraveSearch().is_quota_available() is False
    assert BraveSearch().search("external topic") == []
    assert GeminiSearch().is_available() is False
    assert GeminiSearch().search("external topic") == []
    assert list(tmp_path.iterdir()) == before


@pytest.mark.asyncio
async def test_manual_model_write_and_commit_bypasses_are_tombstoned() -> None:
    with pytest.raises(LegacyMutationLaneDecommissioned, match="decommissioned"):
        await DangerRoom().execute()
    with pytest.raises(LegacyMutationLaneDecommissioned, match="decommissioned"):
        await UtilityBelt("target.py").execute()
    with pytest.raises(LegacyMutationLaneDecommissioned, match="decommissioned"):
        SovereignWrapper().run()
