import asyncio
from src.core.mimir_client import mimir

async def test_think():
    print("[INFO] Testing Mimir's Think (Sampling)...")
    try:
        response = await mimir.think("Hello, One Mind. Can you hear me?", system_prompt="Test prompt")
        if response:
            print(f"[SUCCESS] Oracle responded: {response}")
        else:
            print("[FAILURE] Oracle is silent.")
    except Exception as e:
        print(f"[ERROR] Think failed: {e}")
    finally:
        await mimir.close()

if __name__ == "__main__":
    asyncio.run(test_think())
