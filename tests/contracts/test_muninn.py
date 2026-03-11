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
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord

# ==============================================================================
# TheWatcher Tests
# ==============================================================================

class TestWatcherOscillationLock:
    """Identical content hash submitted twice -> LOCKED status."""

    def test_echo_detection_locks_file(self, tmp_path):
        (tmp_path / ".agents").mkdir()
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
    """Resolves Hall-backed sovereign beads and projects them into tasks.qmd."""

    @staticmethod
    def _seed_beads(root: Path) -> None:
        agents_dir = root / ".agents"
        agents_dir.mkdir()
        (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

        hall = HallOfRecords(root)
        repo = hall.bootstrap_repository()
        hall.record_scan(
            HallScanRecord(
                scan_id="scan-1",
                repo_id=repo.repo_id,
                scan_kind="contract",
                status="COMPLETED",
                baseline_gungnir_score=4.2,
                started_at=1700000000000,
                completed_at=1700000000100,
                metadata={},
            )
        )
        hall.record_file(
            HallFileRecord(
                repo_id=repo.repo_id,
                scan_id="scan-1",
                path="src/fix_thing.py",
                gungnir_score=2.0,
                created_at=1700000000200,
            )
        )

        ledger = NornWarden(root).coordinator.ledger
        ledger.upsert_bead(
            target_path="src/fix_thing.py",
            rationale="Fix the thing",
            contract_refs=["contracts:fix-thing"],
            acceptance_criteria="Raise the baseline above 5.0.",
        )

    def test_get_next_target_finds_first_actionable(self, tmp_path):
        self._seed_beads(tmp_path)
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
