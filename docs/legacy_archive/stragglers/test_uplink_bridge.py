import asyncio
import json
import sys
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
if str(script_dir) not in sys.path:
    sys.path.append(str(script_dir))

from src.cstar.core.uplink import AntigravityUplink


async def test_uplink():
    print("--- ANTIGRAVITY UPLINK TEST ---")
    print("Target Port: 50052 (Bridge)")
    
    uplink = AntigravityUplink()
    query = "ALFRED, are you there? Identify your current uplink status."
    context = {"persona": "ALFRED"}
    
    print(f"Sending Query: '{query}'")
    
    try:
        # We use a timeout to ensure we don't hang if the bridge is silent
        response = await asyncio.wait_for(uplink.send_payload(query, context), timeout=30.0)
        
        print("\n--- RESPONSE RECEIVED ---")
        print(json.dumps(response, indent=2))
        
        if response.get("status") == "success":
            print("\n[PASS] Antigravity Bridge is OPERATIONAL.")
        elif "Bridge Offline" in response.get("message", ""):
            print("\n[FAIL] Bridge is offline. Ensure 'python src/cstar/core/antigravity_bridge.py' is running.")
        else:
            print(f"\n[ERROR] Unexpected response: {response.get('message')}")
            
    except asyncio.TimeoutError:
        print("\n[TIMEOUT] The bridge did not respond within 30 seconds.")
    except Exception as e:
        print(f"\n[CRASH] Test failed with error: {e}")

if __name__ == "__main__":
    asyncio.run(test_uplink())
