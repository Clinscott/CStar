import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord
from src.sentinel.wardens.norn import NornWarden


def seed_sovereign_beads(root: Path):
    agents_dir = root / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-1",
            repo_id=repo.repo_id,
            scan_kind="baseline",
            status="COMPLETED",
            baseline_gungnir_score=5.5,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-1",
            path="src/core/fix_bug.py",
            gungnir_score=2.4,
            created_at=1700000000200,
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-1",
            path="src/core/feature_x.py",
            gungnir_score=6.9,
            created_at=1700000000300,
        )
    )

    ledger = NornWarden(root).coordinator.ledger
    ledger.upsert_bead(
        target_path="src/core/fix_bug.py",
        rationale="Fix bug",
        contract_refs=["contracts:fix-bug"],
        acceptance_criteria="Raise the file baseline above 5.0.",
    )
    ledger.upsert_bead(
        target_path="src/core/feature_x.py",
        rationale="Feature X",
        contract_refs=["contracts:feature-x"],
        acceptance_criteria="Raise the file baseline above 7.0.",
    )


class TestNornEmpire:
    @pytest.fixture
    def mock_root(self, tmp_path):
        seed_sovereign_beads(tmp_path)
        return tmp_path

    def test_scan_no_plan(self, tmp_path):
        """Test behavior when no sovereign beads exist."""
        warden = NornWarden(tmp_path)
        results = warden.scan()
        assert results == []

    def test_scan_valid_task(self, mock_root):
        """Test finding a valid Hall-backed bead."""
        warden = NornWarden(mock_root)
        results = warden.scan()

        assert len(results) == 1
        breach = results[0]
        assert breach["type"] == "CAMPAIGN_TASK"
        assert breach["file"] == "tasks.qmd"
        assert "Fix bug" in breach["action"]

        bead_id = breach["raw_target"]["id"]
        lines = (mock_root / "tasks.qmd").read_text(encoding="utf-8").splitlines()
        expected_line = next(index for index, line in enumerate(lines, start=1) if f"[{bead_id}]" in line)
        assert breach["line"] == expected_line

    def test_scan_completed_task(self, mock_root):
        """Test that resolved beads are ignored for future scans."""
        warden = NornWarden(mock_root)
        targets = warden.scan()
        assert len(targets) == 1

        warden.mark_complete(targets[0]["raw_target"])
        results = warden.scan()
        assert len(results) == 1
        assert "Feature X" in results[0]["action"]

    def test_mark_complete(self, mock_root):
        """Test marking a bead complete through the sovereign ledger."""
        warden = NornWarden(mock_root)
        targets = warden.scan()
        assert len(targets) == 1

        warden.mark_complete(targets[0]["raw_target"])

        new_content = (mock_root / "tasks.qmd").read_text(encoding="utf-8")
        bead_id = targets[0]["raw_target"]["id"]
        assert f"- [>] [{bead_id}]" in new_content

        results = warden.scan()
        assert len(results) == 1
