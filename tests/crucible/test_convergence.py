import unittest
import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.uplink import AntigravityUplink

class TestTheConvergence(unittest.IsolatedAsyncioTestCase):
    """
    [Ω] TIER 4: THE CONVERGENCE (Empire Standard)
    Verifies the Universal Synaptic Bridge (Uplink -> Mimir -> Oracle).
    """

    async def test_synaptic_intelligence_loop(self):
        """Verify the Muninn -> Uplink -> Mimir -> Host loop (Mocked Phase)."""
        print("\n--- TIER 4: THE CONVERGENCE (MOCKED) ---")
        
        with patch('src.cstar.core.uplink.mimir.request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = SimpleNamespace(
                status="success",
                raw_text="The Oracle speaks: Convergence is achieved.",
                error=None,
                trace=SimpleNamespace(
                    correlation_id="convergence",
                    transport_mode="host_session",
                    cached=False,
                ),
            )
            
            # 1. Perform an Uplink request
            uplink = AntigravityUplink()
            query = "Who are you? (Crucible Test)"
            context = {"persona": "ALFRED"}
            
            print("[TEST] Sending synaptic intelligence request...")
            response = await uplink.send_payload(query, context)
            
            # 2. Verify Response
            print(f"[TEST] Response Status: {response.get('status')}")
            self.assertEqual(response.get("status"), "success")
            self.assertIn("raw", response.get("data", {}))
            
            raw_text = response["data"]["raw"]
            self.assertEqual(raw_text, "The Oracle speaks: Convergence is achieved.")
            
            mock_request.assert_called_once()
            print("[PASS] Convergence verified via Synaptic Link.")

if __name__ == '__main__':
    unittest.main()
