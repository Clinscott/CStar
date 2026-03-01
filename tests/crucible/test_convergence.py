import unittest
import asyncio
import json
import os
import sys
import subprocess
import time
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.uplink import AntigravityUplink

class TestTheConvergence(unittest.IsolatedAsyncioTestCase):
    """Tier 4: The Convergence (Full Stack Integration)"""

    async def test_full_intelligence_loop(self):
        """Verify the Muninn -> Uplink -> Bridge -> CLI loop."""
        print("\n--- TIER 4: THE CONVERGENCE ---")
        
        # 1. Start the Bridge in the background
        bridge_script = project_root / "src" / "cstar" / "core" / "antigravity_bridge.py"
        bridge_proc = subprocess.Popen([sys.executable, str(bridge_script)], 
                                        stdout=subprocess.DEVNULL, 
                                        stderr=subprocess.DEVNULL)
        
        # Wait for bridge to warm up
        await asyncio.sleep(5)
        
        try:
            # 2. Perform a real Uplink request
            uplink = AntigravityUplink()
            query = "Who are you? (Crucible Test)"
            context = {"persona": "ALFRED"}
            
            print("[TEST] Sending live intelligence request...")
            # Increase timeout to 120s for convergence robustness
            response = await asyncio.wait_for(uplink.send_payload(query, context), timeout=120.0)
            
            # 3. Verify Response
            print(f"[TEST] Response Status: {response.get('status')}")
            self.assertEqual(response.get("status"), "success")
            self.assertIn("raw", response.get("data", {}))
            
            raw_text = response["data"]["raw"]
            print(f"[TEST] Intelligence Sample: {raw_text[:50]}...")
            self.assertTrue(len(raw_text) > 10)
            print("[PASS] Convergence verified. OAuth-proxy is LIVE.")

        except asyncio.TimeoutError:
            self.fail("Convergence TIMEOUT: The bridge did not respond.")
        except Exception as e:
            self.fail(f"Convergence CRASH: {e}")
        finally:
            # Cleanup
            bridge_proc.terminate()
            bridge_proc.wait()

if __name__ == '__main__':
    unittest.main()
