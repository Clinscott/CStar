import asyncio
import shutil
import sys
from pathlib import Path
from unittest.mock import AsyncMock

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.payload import IntentPayload
from src.cstar.core.forge import Forge


async def main() -> None:
    print("=== Verifying Forge V4 Pipeline ===")

    # Setup Test Environment
    test_dir = project_root / "tests" / "forge_v4_verification"
    test_dir.mkdir(parents=True, exist_ok=True)
    target_file = test_dir / "target_component.py"
    target_file.write_text("# Initial Content", encoding="utf-8")

    # Mock Uplink
    mock_uplink = AsyncMock()

    # Scenario:
    # 1. ODIN returns code.
    # 2. ALFRED returns valid test JSON.
    # 3. Test runs and writes gungnir_{session_id}.json
    # 4. SPRT parses it.

    async def mock_send_payload(query, context):
        if "FORGE:" in query:
            print("[MOCK ODIN] Generating component code...")
            return {
                "status": "success",
                "data": {"code": "def add(a, b): return a + b"}
            }
        elif "SYSTEM DIRECTIVE:" in query:
            print(f"[MOCK ALFRED] Generating test suite (SID: {context.get('session_id')})...")
            session_id = context.get('session_id')

            # Create a test file that PASSES and writes gungnir JSON
            test_code = f"""
import json
from pathlib import Path

def test_add():
    assert 1 + 1 == 2

if __name__ == "__main__":
    test_add()
    # Write Gungnir JSON - 25 clean passes to beat the SPRT Threshold
    Path("gungnir_{session_id}.json").write_text(json.dumps([0] * 25))
"""
            return {
                "status": "success",
                "data": {
                    "lint_command": "echo Linting Passed", # Mock lint
                    "test_command": f"python tests/forge_v4_verification/test_target_{session_id}.py",
                    "test_filename": f"tests/forge_v4_verification/test_target_{session_id}.py",
                    "test_code": test_code
                }
            }
        return {"status": "error", "message": "Unknown query"}

    mock_uplink.send_payload = mock_send_payload

    # Initialize Forge with Mock
    forge = Forge()
    forge.uplink = mock_uplink
    forge.max_retries = 1

    # Execute
    print("\n--- Starting Forge Execution ---")
    payload = IntentPayload(
        system_meta={"confidence": 1.0, "source": "verification"},
        intent_raw="Implement Addition",
        intent_normalized="implement addition",
        target_workflow="FORGE_DIRECT",
        extracted_entities={}
    )
    async for event in forge.execute(payload, str(target_file)):
        print(f"[{event['type'].upper()}]: {event.get('msg') or event.get('message')}")
        if event['type'] == 'result':
            print(f"RESULT: {event}")

    # Cleanup
    shutil.rmtree(test_dir)
    print("\n=== Verification Complete ===")

if __name__ == "__main__":
    asyncio.run(main())
