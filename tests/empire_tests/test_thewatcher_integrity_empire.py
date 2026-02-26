import json
import time

import pytest

from src.sentinel.muninn import TheWatcher


class TestTheWatcher:
    @pytest.fixture
    def watcher(self, tmp_path):
        return TheWatcher(tmp_path)

    def test_record_edit_fatigue(self, watcher):
        rel_path = "logic.py"
        # 10 edits trigger lock
        for i in range(9):
            assert watcher.record_edit(rel_path, f"v{i}") is True

        # 10th edit triggers lock
        assert watcher.record_edit(rel_path, "v10") is False
        assert watcher.is_locked(rel_path) is True

    def test_record_edit_oscillation(self, watcher):
        rel_path = "logic.py"
        assert watcher.record_edit(rel_path, "v1") is True
        assert watcher.record_edit(rel_path, "v2") is True
        # Oscillation to v1
        assert watcher.record_edit(rel_path, "v1") is False
        assert watcher.is_locked(rel_path) is True

    def test_is_locked_cooldown(self, watcher, tmp_path):
        rel_path = "logic.py"
        watcher.record_edit(rel_path, "v1")
        watcher.record_edit(rel_path, "v2")
        watcher.record_edit(rel_path, "v1") # Oscillation -> Lock

        assert watcher.is_locked(rel_path) is True

        # Manually manipulate state for cooldown (1 hour and 1 second ago)
        state_file = tmp_path / ".agent" / "sovereign_state.json"
        state = json.loads(state_file.read_text())
        state[rel_path]["last_edited"] = time.time() - 3601
        state_file.write_text(json.dumps(state))

        # New watcher to reload state
        watcher_new = TheWatcher(tmp_path)
        assert watcher_new.is_locked(rel_path) is False
