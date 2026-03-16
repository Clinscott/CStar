import json
import sys
import textwrap
from pathlib import Path

from src.core.engine.autobot_skill import execute_autobot
from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord


def seed_bead(root: Path) -> str:
    agents_dir = root / ".agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-autobot-1",
            repo_id=repo.repo_id,
            scan_kind="autobot_test",
            status="COMPLETED",
            baseline_gungnir_score=6.0,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-autobot-1",
            path="target.txt",
            gungnir_score=6.0,
            created_at=1700000000200,
        )
    )
    bead = BeadLedger(root).upsert_bead(
        scan_id="scan-autobot-1",
        target_path="target.txt",
        rationale="Make the target file say PASS.",
        contract_refs=["contracts:autobot-target"],
        baseline_scores={"overall": 6.0},
        acceptance_criteria="target.txt contains PASS.",
    )
    return bead.id


def test_execute_autobot_retries_and_resolves_bead(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)
    worker_code = textwrap.dedent(
        """\
        import os
        import select
        import sys
        import time
        from pathlib import Path

        sys.stdout.write("❯ ")
        sys.stdout.flush()
        chunks = []
        started = time.time()
        while time.time() - started < 1.0:
            ready, _, _ = select.select([sys.stdin], [], [], 0.1)
            if not ready:
                if chunks:
                    break
                continue
            data = os.read(sys.stdin.fileno(), 4096)
            if not data:
                break
            chunks.append(data.decode("utf-8", "replace"))

        prompt = "".join(chunks)
        target = Path(os.environ["CORVUS_PROJECT_ROOT"]) / "target.txt"
        if "Previous validation feedback:" in prompt:
            target.write_text("PASS\\n", encoding="utf-8")
        else:
            target.write_text("FAIL\\n", encoding="utf-8")
        print(
            f"AUTOBOT_BEAD_COMPLETE::{os.environ['CORVUS_BEAD_ID']}::ATTEMPT::{os.environ['CORVUS_ATTEMPT']}"
        )
        sys.stdout.write("❯ ")
        sys.stdout.flush()
        time.sleep(5)
        """
    )

    result = execute_autobot(
        tmp_path,
        bead_id=bead_id,
        checker_shell='grep -q PASS "$CORVUS_PROJECT_ROOT/target.txt"',
        max_attempts=2,
        command=sys.executable,
        command_args=["-u", "-c", worker_code],
        no_stream=True,
    )

    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert result.status == "SUCCESS"
    assert result.outcome == "RESOLVED"
    assert result.bead_id == bead_id
    assert result.attempt_count == 2
    assert result.validation_id is not None
    assert bead is not None
    assert bead.status == "RESOLVED"
    assert bead.resolved_validation_id == result.validation_id
    assert (tmp_path / "target.txt").read_text(encoding="utf-8").strip() == "PASS"
