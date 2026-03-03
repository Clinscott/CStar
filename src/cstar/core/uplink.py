import asyncio
import json
import os
import sys
import time
import logging
from pathlib import Path
from typing import Any, Optional

# Add project root to path for src imports
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

class AntigravityUplink:
    """
    Antigravity Uplink Protocol (v4.1).
    Connects to the local Antigravity Bridge (Port 50052) to handle
    high-level intelligence requests via Gemini CLI Proxy.
    """

    DEFAULT_TIMEOUT = 350.0  # seconds for socket read
    logger = logging.getLogger('antigravity_uplink')

    def __init__(self, host: str = "127.0.0.1", port: int = 50052, api_key: str | None = None) -> None:
        self.host = host
        self.port = port
        self.api_key = api_key  # [Ω] Defaults to None to force CLI-native auth first

    async def send_payload(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Sends a JSON payload to the bridge and returns the response with automatic fallback."""
        def create_payload(key: str | None) -> dict[str, Any]:
            return {
                "query": query,
                "context": context or {},
                "api_key": key,
                "source": "cstar_cli",
                "timestamp": time.time()
            }

        persona = (context or {}).get("persona", "ALFRED")
        msg = f"{persona}: Consulting the Archives, sir..."
        
        # [Ω] First Pass: Try with explicit key OR None (forcing CLI config)
        task = asyncio.create_task(self._transmit_socket(create_payload(self.api_key)))
        result = await self._spinner(task, msg)
        
        # [Ω] Second Pass: If auth fails and we haven't tried the env var yet, fallback.
        if result.get("code") == "AUTH_REQUIRED" and self.api_key is None:
            fallback_key = os.environ.get("GEMINI_API_KEY")
            if fallback_key:
                self.logger.info("CLI auth failed. Falling back to environment variable.")
                task = asyncio.create_task(self._transmit_socket(create_payload(fallback_key)))
                result = await self._spinner(task, msg)
        
        return result

    async def _transmit_socket(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Low-level socket transmission to the bridge with timeout."""
        try:
            reader, writer = await asyncio.open_connection(self.host, self.port)
            
            # Send Data
            writer.write(json.dumps(payload).encode('utf-8'))
            await writer.drain()
            
            # Read Response with timeout
            try:
                data = await asyncio.wait_for(reader.read(), timeout=self.DEFAULT_TIMEOUT)
            except asyncio.TimeoutError:
                self.logger.error("Socket read timed out")
                return {"status": "error", "message": f"Bridge response timed out after {self.DEFAULT_TIMEOUT}s"}
            finally:
                writer.close()
                await writer.wait_closed()
            
            if not data:
                return {"status": "error", "message": "Empty response from bridge."}
                
            response = json.loads(data.decode('utf-8'))
            
            # Schema Validation
            if "status" not in response or ("data" not in response and "message" not in response):
                return {"status": "error", "message": "Malformed response schema from bridge."}
                
            return response

        except ConnectionRefusedError:
            self.logger.error("Bridge connection refused")
            return {
                "status": "error", 
                "message": "Bridge Offline. Ensure 'antigravity_bridge.py' is running on port 50052."
            }
        except Exception as e:
            self.logger.error(f"Uplink Failure: {e}")
            return {"status": "error", "message": f"Uplink Failure: {e}"}

    async def _spinner(self, task: asyncio.Task, msg: str) -> dict[str, Any]:
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

    @staticmethod
    async def query_bridge(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Helper to quickly dispatch a query to the bridge."""
        uplink = AntigravityUplink()
        return await uplink.send_payload(query, context)

if __name__ == "__main__":
    # Test block
    if len(sys.argv) > 1:
        asyncio.run(AntigravityUplink.query_bridge(sys.argv[1]))
