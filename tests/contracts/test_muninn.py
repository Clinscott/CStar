"""Non-Ravens warden contracts retained after Python Ravens retirement."""

import json
from pathlib import Path

from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord
from src.core.engine.wardens.edda import EddaWarden
from src.core.engine.wardens.norn import NornWarden


class TestNornWarden:
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

        NornWarden(root).coordinator.ledger.upsert_bead(
            target_path="src/fix_thing.py",
            rationale="Fix the thing",
            contract_refs=["contracts:fix-thing"],
            acceptance_criteria="Raise the baseline above 5.0.",
        )

    def test_get_next_target_finds_first_actionable(self, tmp_path: Path) -> None:
        self._seed_beads(tmp_path)
        target = NornWarden(tmp_path).get_next_target()
        assert target is not None
        assert "Fix the thing" in target["action"]


class TestEddaWarden:
    def test_detects_missing_docstrings(self, tmp_path: Path) -> None:
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        no_doc = src_dir / "no_docs.py"
        no_doc.write_text("def naked():\n    pass\n", encoding="utf-8")
        targets = EddaWarden(tmp_path).scan()
        assert any("no_docs.py" in target["file"] for target in targets)
