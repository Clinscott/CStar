import json
from pathlib import Path

from src.core.engine.cortex import Cortex


def _seed_project(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.qmd").write_text("# AGENTS\nLaw 1: Be helpful.\n", encoding="utf-8")
    (tmp_path / "memories.qmd").write_text("# Memories\nFact: Sky is blue.\n", encoding="utf-8")
    (tmp_path / "src" / "data").mkdir(parents=True)
    (tmp_path / "src" / "data" / "stopwords.json").write_text("[]", encoding="utf-8")


def test_cortex_refresh_reingests_changed_documents(tmp_path, monkeypatch) -> None:
    _seed_project(tmp_path)

    class MockBrain:
        def __init__(self, **kwargs):
            self.skills: dict[str, str] = {}
            self.build_calls = 0

        def add_skill(self, trigger, text):
            self.skills[trigger] = text

        def build_index(self):
            self.build_calls += 1

        async def search(self, text):
            return [{"trigger": text, "score": 1.0}]

    monkeypatch.setattr("src.core.engine.cortex.SovereignVector", MockBrain)

    cortex = Cortex(tmp_path, tmp_path / "base")
    initial_builds = cortex.brain.build_calls
    assert cortex.brain.skills["memories > Memories"] == "Fact: Sky is blue."

    (tmp_path / "memories.qmd").write_text("# Memories\nFact: Grass is green.\n", encoding="utf-8")
    cortex.source_mtimes["memories"] = 0

    changed = cortex.refresh()

    assert changed is True
    assert cortex.brain.build_calls == initial_builds + 1
    assert cortex.brain.skills["memories > Memories"] == "Fact: Grass is green."


def test_cortex_query_runs_async_brain_search_synchronously(tmp_path, monkeypatch) -> None:
    _seed_project(tmp_path)

    class MockBrain:
        def __init__(self, **kwargs):
            pass

        def add_skill(self, trigger, text):
            pass

        def build_index(self):
            pass

        async def search(self, text):
            return [{"trigger": "AGENTS > AGENTS", "score": 0.9, "description": text}]

    monkeypatch.setattr("src.core.engine.cortex.SovereignVector", MockBrain)

    cortex = Cortex(tmp_path, tmp_path / "base")
    result = cortex.query("Who is Odin?")

    assert result[0]["trigger"] == "AGENTS > AGENTS"
    assert result[0]["description"] == "Who is Odin?"
