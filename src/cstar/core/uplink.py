import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

# Add project root to path for src imports
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

class AntigravityUplink:
    """
    Antigravity Uplink Protocol (v4.0).
    Connects to the local Antigravity Bridge (Port 50052) to handle
    high-level intelligence requests via Gemini CLI Proxy.
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 50052, api_key: str | None = None):
        self.host = host
        self.port = port
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")

    async def send_payload(self, query: str, context: dict | None = None) -> dict:
        """Sends a JSON payload to the bridge and returns the response."""
        payload = {
            "query": query,
            "context": context or {},
            "api_key": self.api_key,
            "source": "cstar_cli",
            "timestamp": time.time()
        }

        persona = (context or {}).get("persona", "ALFRED")
        msg = f"{persona}: Consulting the Archives, sir..."
        
        # Wrapped in a spinner for UX if running in a TTY
        task = asyncio.create_task(self._transmit_socket(payload))
        return await self._spinner(task, msg)

    async def _transmit_socket(self, payload: dict) -> dict:
        """Low-level socket transmission to the bridge."""
        try:
            reader, writer = await asyncio.open_connection(self.host, self.port)
            
            # Send Data
            writer.write(json.dumps(payload).encode('utf-8'))
            await writer.drain()
            
            # Read Response
            data = await reader.read()
            writer.close()
            await writer.wait_closed()
            
            if not data:
                return {"status": "error", "message": "Empty response from bridge."}
                
            return json.loads(data.decode('utf-8'))

        except ConnectionRefusedError:
            return {
                "status": "error", 
                "message": "Bridge Offline. Ensure 'antigravity_bridge.py' is running on port 50052."
            }
        except Exception as e:
            return {"status": "error", "message": f"Uplink Failure: {e}"}

    async def _spinner(self, task: asyncio.Task | Any, msg: str) -> dict:
        """Renders a CLI spinner while waiting for the task."""
        if not sys.stdout.isatty():
            return await task

        chars = "|/-\\"
        idx = 0
        sys.stdout.write("\033[?25l") # Hide cursor
        try:
            while not task.done():
                sys.stdout.write(f"\r{msg} {chars[idx % len(chars)]} ")
                sys.stdout.flush()
                idx += 1
                await asyncio.sleep(0.1)
            # Clear line
            sys.stdout.write("\r" + " " * (len(msg) + 10) + "\r")
            return await task
        finally:
            sys.stdout.write("\033[?25h") # Show cursor

async def query_bridge(query: str, context: dict | None = None) -> dict:
    uplink = AntigravityUplink()
    return await uplink.send_payload(query, context)
