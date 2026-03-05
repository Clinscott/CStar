import asyncio
import json

async def test():
    try:
        reader, writer = await asyncio.open_connection('127.0.0.1', 50052)
        payload = {
            "query": "Respond exactly with: BRIDGE_ACTIVE",
            "context": {"persona": "ODIN"},
            "api_key": None
        }
        writer.write(json.dumps(payload).encode('utf-8'))
        await writer.drain()
        writer.write_eof()
        
        data = await reader.read()
        print(f"RESPONSE: {data.decode('utf-8')}")
        writer.close()
        await writer.wait_closed()
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test())
