#!/bin/bash
set -e

# Paths
CSTAR_ROOT="/home/morderith/Corvus/CStar"
TEST_ROOT="/tmp/autobot_e2e_test"
MOCK_ORCHESTRATOR="$CSTAR_ROOT/tests/autobot_extensive/mocks/mock_autobot_orchestrator.py"

export PYTHONPATH="$CSTAR_ROOT"

echo "🔱 [E2E] Setting up temporary project root at $TEST_ROOT"
rm -rf "$TEST_ROOT"
mkdir -p "$TEST_ROOT"
cd "$TEST_ROOT"

# 1. Initialize Bead Ledger and Hall (Seed)
python3 - <<EOF
import json
import os
from pathlib import Path
from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord

root = Path("$TEST_ROOT")
agents_dir = root / ".agents"
agents_dir.mkdir(parents=True, exist_ok=True)
(agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

hall = HallOfRecords(root)
repo = hall.bootstrap_repository()
hall.record_scan(
    HallScanRecord(
        scan_id="scan-e2e",
        repo_id=repo.repo_id,
        scan_kind="e2e",
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

BeadLedger(root).upsert_bead(
    scan_id="scan-e2e",
    target_path="e2e_target.txt",
    rationale="TRIGGER_WRITE",
    contract_refs=["src/core/engine/autobot_skill.py"],
    baseline_scores={"overall": 5.0},
    acceptance_criteria="contains MOCK_CONTENT",
)
EOF

echo "🔱 [E2E] Bead seeded successfully."

# 2. Run AutoBot Skill with Mock Orchestrator
echo "🔱 [E2E] Launching AutoBot skill..."

python3 - <<EOF
import sys
import json
import os
from unittest.mock import patch
import subprocess

# Patch SovereignWorker._call_llm to use our mock
from src.core.engine.sovereign_worker import SovereignWorker

# We need the real subprocess.run to call the mock
from subprocess import run as real_run

def mock_call(self):
    task_str = f"Context: {self.messages}\n\nPlease provide a completion for the last message."
    # We pass the env from the worker context to the mock
    mock_env = os.environ.copy()
    # Find the target path from the last message or worker state if possible,
    # but for E2E we know it's e2e_target.txt
    mock_env["CORVUS_TARGET_PATH"] = "e2e_target.txt"

    res = real_run(
        [sys.executable, "$MOCK_ORCHESTRATOR", "run_hermes", task_str],
        capture_output=True,
        text=True,
        check=True,
        env=mock_env
    )
    return res.stdout.strip()

with patch("src.core.engine.sovereign_worker.SovereignWorker._call_llm", mock_call):
    from src.core.engine.autobot_skill import execute_autobot
    result = execute_autobot(
        "$TEST_ROOT",
        claim_next=True,
        max_attempts=1,
        no_stream=True,
        checker_shell="grep -q MOCK_CONTENT e2e_target.txt"
    )
    print(json.dumps(result.to_dict(), indent=2))
    if result.status != "SUCCESS":
        sys.exit(1)
EOF

# 3. Verify Results
echo "🔱 [E2E] Verifying results..."
if [ -f "$TEST_ROOT/e2e_target.txt" ] && grep -q "MOCK_CONTENT" "$TEST_ROOT/e2e_target.txt"; then
    echo "✅ [E2E] File created and content verified."
else
    echo "❌ [E2E] File verification failed."
    exit 1
fi

# Check ledger status
python3 - <<EOF
from src.core.engine.bead_ledger import BeadLedger
from pathlib import Path
ledger = BeadLedger(Path("$TEST_ROOT"))
beads = ledger.list_beads()
bead = beads[0]
print(f"Bead Status: {bead.status}")
if bead.status != "RESOLVED":
    import sys
    sys.exit(1)
EOF

echo "✅ [E2E] Bead status verified as RESOLVED."
echo "🔱 [E2E] Full AutoBot cycle test PASSED."
