import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord
from src.sentinel.muninn import NornWarden


def seed_campaign(root: Path):
    agents_dir = root / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-campaign-1",
            repo_id=repo.repo_id,
            scan_kind="campaign",
            status="COMPLETED",
            baseline_gungnir_score=4.8,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-campaign-1",
            path="src/core/fix_thing.py",
            gungnir_score=2.1,
            created_at=1700000000200,
        )
    )

    ledger = NornWarden(root).coordinator.ledger
    ledger.upsert_bead(
        target_path="src/core/fix_thing.py",
        rationale="Fix the thing",
        contract_refs=["contracts:fix-thing"],
        acceptance_criteria="Raise the file baseline above 5.0.",
    )


class TestNornWarden:
    @pytest.fixture
    def plan_root(self, tmp_path):
        seed_campaign(tmp_path)
        return tmp_path

    def test_get_next_target(self, plan_root):
        warden = NornWarden(plan_root)
        target = warden.get_next_target()

        assert target is not None
        assert target["file"] == "tasks.qmd"
        assert "Fix the thing" in target["action"]

        bead_id = target["raw_target"]["id"]
        lines = (plan_root / "tasks.qmd").read_text(encoding="utf-8").splitlines()
        expected_line = next(index for index, line in enumerate(lines) if f"[{bead_id}]" in line)
        assert target["line_index"] == expected_line

    def test_mark_complete(self, plan_root):
        warden = NornWarden(plan_root)
        target = warden.get_next_target()
        assert target is not None
        warden.mark_complete(target["raw_target"])

        content = (plan_root / "tasks.qmd").read_text(encoding="utf-8")
        bead_id = target["raw_target"]["id"]
        assert f"- [>] [{bead_id}]" in content
