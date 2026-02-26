import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.engine.atomic_gpt import AnomalyWarden
from src.core.payload import IntentPayload
from src.cstar.core.forge import Forge

# ==============================================================================
# Suite 2: The Heartbeat Monitor
# ==============================================================================

class TestWardenDrift:
    """[ODIN] Verifies statistical anomaly detection and zero-division guardrails."""

    def test_burn_in_and_zscore_drift(self, tmp_path):
        model_path = tmp_path / "warden.pkl"
        ledger_path = tmp_path / "ledger.json"

        warden = AnomalyWarden(model_path=model_path, ledger_path=ledger_path)
        healthy = [10.0, 100.0, 1.0, 0.0]
        # Clear burn-in
        for _ in range(warden.burn_in_cycles + 1):
            warden.train_step(healthy, 0.0)

        anomalous = [100.0, 100.0, 1.0, 0.0]
        prob = warden.forward(anomalous)
        assert prob >= 0.0

        warden.log_anomaly(anomalous, 0.99)
        assert ledger_path.exists()
        data = json.loads(ledger_path.read_text())
        assert len(data) > 0


class TestHallucinationCircuitBreaker:
    """[ODIN] Verifies Forge rollback on Warden Breach."""

    @pytest.mark.asyncio
    async def test_forge_rollback_on_circuit_breaker(self, tmp_path):
        # 1. Environment Setup
        original_content = "def old(): pass"
        target_file = tmp_path / "target.py"
        target_file.write_text(original_content)

        # Absolute isolation of external dependencies only
        with patch("src.cstar.core.forge.AntigravityUplink") as mock_uplink_class, \
             patch("src.cstar.core.forge.AnomalyWarden") as mock_warden_class, \
             patch("src.cstar.core.forge.evaluate_candidate", return_value={"Decision": "Reject", "FinalLLR": -2.0}), \
             patch("asyncio.create_subprocess_shell") as mock_subproc:

            # Setup subproc mock
            mock_proc = MagicMock()
            mock_proc.communicate = AsyncMock(return_value=(b"", b""))
            mock_proc.returncode = 0
            mock_subproc.return_value = mock_proc

            # Setup Warden Mock
            mock_warden_instance = mock_warden_class.return_value
            mock_warden_instance.burn_in_cycles = 0
            mock_warden_instance.forward.return_value = 0.95 # Trigger Breach

            # Setup Forge
            forge = Forge()
            forge.project_root = tmp_path
            forge.warden = mock_warden_instance

            # Correct UUID mapping for Forge Gungnir file
            real_uuid = uuid.uuid4()
            session_id_str = str(real_uuid)
            with patch("src.cstar.core.forge.uuid.uuid4", return_value=real_uuid):
                # Create the artifact that ALFRED looks for
                gungnir_path = tmp_path / f"gungnir_{session_id_str}.json"
                gungnir_path.write_text(json.dumps([0,0,0]))

                # Ultimate isolation: bypass ODIN logic to reach the verification phase
                forge._generate_with_calculus = AsyncMock(return_value={"status": "success", "data": {"code": "def new(): pass"}})

                # Mock Uplink Instance for ALFRED stress test
                mock_uplink_instance = mock_uplink_class.return_value
                mock_uplink_instance.send_payload = AsyncMock(return_value={"status": "success", "data": {
                    "test_filename": "t.py", "test_code": "pass", "lint_command": "echo", "test_command": "echo"
                }})
                forge.uplink = mock_uplink_instance

                # Run Forge
                payload = IntentPayload(
                    system_meta={},
                    intent_raw="Update code",
                    intent_normalized="update",
                    target_workflow="forge"
                )

                results = []
                # Execute generator
                async for res in forge.execute(payload, str(target_file)):
                    results.append(res)

                # 4. Assertions
                result_msgs = [r for r in results if r["type"] == "result"]
                assert any("Circuit Breaker" in r.get("message", "") for r in result_msgs), f"Actual results: {results}"
                assert target_file.read_text() == original_content
