import unittest
import asyncio
import sys
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
        
        # We mock mimir.think because live tests require a pre-flight mock success.
        with patch('src.cstar.core.uplink.mimir.think', new_callable=AsyncMock) as mock_think:
            mock_think.return_value = "The Oracle speaks: Convergence is achieved."
            
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
            
            # 3. Verify Mimir was called
            mock_think.assert_called_once()
            print("[PASS] Convergence verified via Synaptic Link.")

if __name__ == '__main__':
    unittest.main()
