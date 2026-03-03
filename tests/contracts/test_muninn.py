"""
Muninn Contract Tests (v5.0)
Verifies: MuninnHeart, MuninnCrucible, TheWatcher, NornWarden, EddaWarden.
All tests use mock AI client/uplink — zero network calls.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

# Ensure project root is on path
project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.sentinel.muninn import Muninn
from src.sentinel.muninn_heart import MuninnHeart
from src.sentinel.muninn_crucible import MuninnCrucible
from src.sentinel.stability import TheWatcher
from src.sentinel.wardens.norn import NornWarden
from src.sentinel.wardens.edda import EddaWarden

# ==============================================================================
# TheWatcher Tests
# ==============================================================================

class TestWatcherOscillationLock:
    """Identical content hash submitted twice -> LOCKED status."""

    def test_echo_detection_locks_file(self, tmp_path):
        (tmp_path / ".agent").mkdir()
        watcher = TheWatcher(tmp_path)
        rel = "src/sample.py"
        content = "print('hello')"

        # First edit: OK
        assert watcher.record_edit(rel, content) is True

        # Second edit with DIFFERENT content: OK
        assert watcher.record_edit(rel, content + " # v2") is True

        # Third edit with SAME content as first: Oscillation -> LOCKED
        result = watcher.record_edit(rel, content)
        assert result is False
        assert watcher.is_locked(rel) is True


# ==============================================================================
# Warden Tests
# ==============================================================================

class TestNornWarden:
    """Parses tasks.qmd and checks completed items."""
    PLAN_CONTENT = "# Task List\n- [ ] Fix the thing\n- [x] Already done\n"

    def test_get_next_target_finds_first_actionable(self, tmp_path):
        (tmp_path / "tasks.qmd").write_text(self.PLAN_CONTENT, encoding="utf-8")
        cs = NornWarden(tmp_path)
        target = cs.get_next_target()
        assert target is not None
        assert "Fix the thing" in target["action"]

class TestEddaWarden:
    """Detects Python files missing docstrings."""
    def test_detects_missing_docstrings(self, tmp_path):
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        no_doc = src_dir / "no_docs.py"
        no_doc.write_text("def naked():\n    pass\n", encoding="utf-8")
        edda = EddaWarden(tmp_path)
        targets = edda.scan()
        assert any("no_docs.py" in t["file"] for t in targets)

# ==============================================================================
# Crucible & Heart Tests
# ==============================================================================

class TestMuninnCrucible:
    """Verifies Gauntlet generation and Rollback logic."""

    @patch("src.sentinel.muninn_crucible.BifrostGate")
    def test_rollback_restores_backup(self, mock_gate, tmp_path):
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        target_file = src_dir / "target.py"
        original_content = "# Original\n"
        target_file.write_text(original_content, encoding="utf-8")

        # Create .bak
        target_file.with_suffix(".py.bak").write_text(original_content, encoding="utf-8")
        target_file.write_text("# Corrupted\n", encoding="utf-8")

        mock_uplink = MagicMock()
        crucible = MuninnCrucible(tmp_path, mock_uplink)
        crucible.rollback(target_file)

        assert target_file.read_text(encoding="utf-8") == original_content

    @patch("src.sentinel.muninn_crucible.BifrostGate")
    def test_generate_gauntlet_calls_uplink(self, mock_gate_cls, tmp_path):
        mock_gate = MagicMock()
        mock_gate.sanitize_test.return_value = "def test_fix(): assert True"
        mock_gate_cls.return_value = mock_gate

        mock_uplink = MagicMock()
        mock_uplink.send_payload = AsyncMock(return_value={
            "status": "success",
            "data": {"code": "def test_fix(): assert True"}
        })
        
        crucible = MuninnCrucible(tmp_path, mock_uplink)
        target = {"file": "src/logic.py", "action": "Fix bug"}
        
        # We need to run this in an event loop
        path = asyncio.run(crucible.generate_gauntlet(target, "def logic(): pass"))
        
        assert path is not None
        assert "tests/gauntlet" in path.as_posix()
        mock_uplink.send_payload.assert_called()

class TestMuninnHeartEndurance:
    """Verifies 6-hour limit enforcement."""

    def test_endurance_limit_stop(self, tmp_path):
        mock_uplink = MagicMock()
        heart = MuninnHeart(tmp_path, mock_uplink)
        # Set start time to 7 hours ago
        import time
        heart.start_time = time.time() - 25200 
        
        result = asyncio.run(heart.execute_cycle())
        assert result is False
