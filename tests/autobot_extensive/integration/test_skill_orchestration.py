import pytest
import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

from src.core.engine.autobot_skill import execute_autobot
from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord

def seed_bead(root: Path, rationale: str = "TRIGGER_WRITE") -> str:
    agents_dir = root / ".agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-1",
            repo_id=repo.repo_id,
            scan_kind="test",
            status="COMPLETED",
            baseline_gungnir_score=5.0,
            started_at=0,
            completed_at=0,
            metadata={},
        )
    )
    # Ensure src directory exists for contract ref
    (root / "src/core/engine").mkdir(parents=True, exist_ok=True)
    (root / "src/core/engine/autobot_skill.py").touch()

    bead = BeadLedger(root).upsert_bead(
        scan_id="scan-1",
        target_path="target.txt",
        rationale=rationale,
        contract_refs=["src/core/engine/autobot_skill.py"],
        baseline_scores={"overall": 5.0},
        acceptance_criteria="contains MOCK_CONTENT",
    )
    return bead.id

# We use a global-ish patch approach that carefully avoids recursion
REAL_SUBPROCESS_RUN = subprocess.run

def test_autobot_skill_with_sovereign_worker_integration(tmp_path):
    bead_id = seed_bead(tmp_path)
    mock_orchestrator = str(Path(__file__).parents[1] / "mocks" / "mock_autobot_orchestrator.py")

    def side_effect(cmd, **kwargs):
        # Only intercept the specific call to the orchestrator
        if isinstance(cmd, list) and len(cmd) > 1 and "autobot_orchestrator.py" in str(cmd[1]):
            real_cmd = [sys.executable, mock_orchestrator, "run_hermes", cmd[3]]
            return REAL_SUBPROCESS_RUN(real_cmd, capture_output=True, text=True)
        # For everything else, use the real thing
        return REAL_SUBPROCESS_RUN(cmd, **kwargs)

    with patch("subprocess.run", side_effect=side_effect):
        result = execute_autobot(
            tmp_path,
            bead_id=bead_id,
            max_attempts=1,
            no_stream=True,
            checker_shell="grep -q MOCK_CONTENT target.txt"
        )

        assert result.status == "SUCCESS"
        assert result.outcome == "RESOLVED"
        assert (tmp_path / "target.txt").exists()
        assert "MOCK_CONTENT" in (tmp_path / "target.txt").read_text()

def test_autobot_skill_handles_worker_failure(tmp_path):
    bead_id = seed_bead(tmp_path, rationale="TRIGGER_FAIL")
    mock_orchestrator = str(Path(__file__).parents[1] / "mocks" / "mock_autobot_orchestrator.py")

    def side_effect(cmd, **kwargs):
        if isinstance(cmd, list) and len(cmd) > 1 and "autobot_orchestrator.py" in str(cmd[1]):
            real_cmd = [sys.executable, mock_orchestrator, "run_hermes", cmd[3]]
            return REAL_SUBPROCESS_RUN(real_cmd, capture_output=True, text=True)
        return REAL_SUBPROCESS_RUN(cmd, **kwargs)

    with patch("subprocess.run", side_effect=side_effect):
        result = execute_autobot(
            tmp_path,
            bead_id=bead_id,
            max_attempts=1,
            no_stream=True
        )

        assert result.status == "FAILURE"
        assert result.outcome == "BLOCKED"
        assert "I am failing. Error: Mock failure." in result.metadata["worker_failure"]
