import os
import asyncio
import json
import socket
import sys
import time
from pathlib import Path

# Add project root to path for src imports
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.ui import HUD

# Constants
ANTIGRAVITY_HOST = '127.0.0.1'
ANTIGRAVITY_PORT = 50052 # Distinct from Daemon port
TIMEOUT_SECONDS = 30

class AntigravityUplink:
    """
    The Bridge to the Void.
    Handles offloading complex queries to the external Antigravity system.
    """
    
    def __init__(self, api_key: str = None):
        """
        Initializes the AntigravityUplink.
        
        Args:
            api_key (str, optional): The Google GenAI API key. 
                                     Prioritizes injected key over GOOGLE_API_KEY env var.
        """
        self.host = ANTIGRAVITY_HOST
        self.port = ANTIGRAVITY_PORT
        
        # 1. Load Environment variables from .env.local
        try:
            from dotenv import load_dotenv
            env_path = project_root / ".env.local"
            load_dotenv(env_path)
        except ImportError:
            pass # Graceful fallback if dotenv is missing
            
        # 2. Accept injected key, fallback to standard TUI key
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        
        if not self.api_key:
            HUD.persona_log("WARN", "No API key found for AntigravityUplink. Simulation mode only.")

        
        if not self.api_key:
            # We don't raise here yet to allow Simulation mode in bridge, 
            # but we log it.
            pass
        
    async def send_payload(self, query: str, context: dict = None) -> dict:
        """
        Asynchronously sends a payload to Antigravity with a visual spinner.
        """
        if context is None:
            context = {}
            
        payload = {
            "query": query,
            "context": context,
            "timestamp": time.time(),
            "source": "cstar_cli",
            "api_key": self.api_key
        }
        
        # Determine Spinner Message based on Persona
        msg = "ODIN: Communing with the void..." if context.get("persona") == "ODIN" else "ALFRED: Consulting the Archives, sir..."
        
        # Start the task
        task = asyncio.create_task(self._transmit(payload))
        
        # Run Spinner while waiting
        try:
            return await self._spinner(task, msg)
        except Exception as e:
            return {
                "status": "error", 
                "message": f"Uplink Severed: {str(e)}",
                "fallback": True
            }

    async def _transmit(self, payload: dict) -> dict:
        """Internal transmission logic."""
        try:
            reader, writer = await asyncio.open_connection(self.host, self.port)
            
            # Send
            writer.write(json.dumps(payload).encode('utf-8'))
            await writer.drain()
            writer.write_eof() # Explicit EOF to unblock server read
            
            # Receive (with timeout)
            data = await asyncio.wait_for(reader.read(8192), timeout=TIMEOUT_SECONDS)
            response = json.loads(data.decode('utf-8'))
            
            writer.close()
            await writer.wait_closed()
            
            return response
            
        except (ConnectionRefusedError, OSError):
            # Simulation Mode for Development if Antigravity is offline
            # In production, this would be a hard error or fallback to local LLM
            await asyncio.sleep(1) # Simulate network lag
            return {
                "status": "success",
                "message": f"[SIMULATION] Antigravity received: {payload['query']}",
                "data": {"insight": "42"}
            }
        except asyncio.TimeoutError:
             return {"status": "error", "message": "Antigravity Validation Timeout."}


    async def _spinner(self, task, message):
        """Runs a CLI spinner until the task completes."""
        spinner_chars = ['|', '/', '-', '\\']
        idx = 0
        
        # Hide Cursor
        sys.stdout.write("\033[?25l")
        
        try:
            while not task.done():
                sys.stdout.write(f"\r{message} {spinner_chars[idx]}")
                sys.stdout.flush()
                idx = (idx + 1) % len(spinner_chars)
                await asyncio.sleep(0.1)
            
            sys.stdout.write("\r" + " " * (len(message) + 2) + "\r") # Clear line
            return await task
        finally:
            # Show Cursor
            sys.stdout.write("\033[?25h")

async def query_bridge(query: str, context: dict = None) -> dict:
    """Convenience wrapper for the AntigravityUplink."""
    uplink = AntigravityUplink()
    return await uplink.send_payload(query, context)

# Quick Test
if __name__ == "__main__":
    async def main():
        uplink = AntigravityUplink()
        print("Testing Uplink...")
        res = await uplink.send_payload("What is the speed of an unladen swallow?", {"persona": "ODIN"})
        print(json.dumps(res, indent=2))
        
    asyncio.run(main())
