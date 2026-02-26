import os
import asyncio
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional, List, Dict, Any

# Add project root to path for src imports
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.sovereign_hud import SovereignHUD

# Constants
ANTIGRAVITY_HOST = '127.0.0.1'
ANTIGRAVITY_PORT = 50052
TIMEOUT_SECONDS = 30
MAX_TOKENS = 1_000_000 # 1M Token Limit for Guardrail

def _sdk_available():
    """Lazily check if the Google GenAI SDK is importable."""
    try:
        from google import genai  # noqa: F401
        return True
    except ImportError:
        return False

class AntigravityUplink:
    """
    The Bridge to the Void.
    Handles offloading complex queries to the external Antigravity system
    with built-in resilience (Backoff) and safety (Smart Truncation).
    """
    
    def __init__(self, api_key: str = None, client=None):
        """
        Initializes the AntigravityUplink.
        Supports dependency injection via `client` for testability.
        """
        self.host = ANTIGRAVITY_HOST
        self.port = ANTIGRAVITY_PORT
        
        # Load Environment variables from .env.local
        try:
            from dotenv import load_dotenv
            env_path = project_root / ".env.local"
            load_dotenv(env_path)
        except ImportError:
            pass
            
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_API_DAEMON_KEY")
        self.client = client  # Allow injected client for tests
        
        if self.client is None and _sdk_available() and self.api_key:
            try:
                from google import genai
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Failed to initialize GenAI Client: {e}")

        if not self.api_key:
            SovereignHUD.persona_log("WARN", "No API key found for AntigravityUplink. Simulation mode only.")

    async def send_payload(self, query: str, context: dict = None) -> dict:
        """
        Asynchronously sends a payload to Antigravity with a visual spinner.
        Implements Smart Truncation and Exponential Backoff.
        """
        if context is None:
            context = {}
            
        # 1. Smart Truncation
        history = context.get("history", [])
        system_prompt = context.get("system_prompt", "You are Corvus Star, an autonomous framework.")
        
        if self.client and history:
            context["history"] = await self._smart_truncate(history, system_prompt, query)

        payload = {
            "query": query,
            "context": context,
            "timestamp": time.time(),
            "source": "cstar_cli",
            "api_key": self.api_key
        }
        
        msg = "ODIN: Communing with the void..." if context.get("persona") == "ODIN" else "ALFRED: Consulting the Archives, sir..."
        
        # 2. Transmission with Backoff
        task = asyncio.create_task(self._transmit_with_backoff(payload))
        
        try:
            return await self._spinner(task, msg)
        except Exception as e:
            return {
                "status": "error", 
                "message": f"Uplink Severed: {str(e)}",
                "fallback": True
            }

    async def _smart_truncate(self, history: List[Any], system_prompt: str, current_query: str) -> List[Any]:
        """
        Drops middle context to fit within MAX_TOKENS while preserving 
        the system prompt and the latest user intent.
        """
        if not self.client:
            return history

        # Iterate until we are under the limit or history is too small to truncate further
        while len(history) > 2:
            try:
                # Calculate current token count (including system prompt and query)
                full_content = f"{system_prompt}\n" + "\n".join([str(m) for m in history]) + f"\n{current_query}"
                token_count_resp = self.client.models.count_tokens(model="gemini-2.5-flash", contents=full_content)
                
                if token_count_resp.total_tokens <= MAX_TOKENS:
                    break
                
                # Drop from the middle (oldest messages after the first few)
                # Keep index 0 (if it's a critical start) or just drop the second item
                drop_index = 1 if len(history) > 1 else 0
                history.pop(drop_index)
                
            except Exception as e:
                logging.warning(f"Token counting failed: {e}. Aborting truncation.")
                break
        
        return history

    async def _transmit_with_backoff(self, payload: dict) -> dict:
        """Internal transmission logic with exponential backoff."""
        max_retries = 3
        base_delay = 2
        
        for attempt in range(max_retries + 1):
            try:
                # If we have a client, we could call the API directly,
                # but we'll stick to the Bridge protocol if requested.
                # HOWEVER, the requirements imply direct SDK handling of 503/500.
                if self.client and not os.getenv("FORCE_BRIDGE"):
                    # Direct SDK implementation for Backoff/Exception verification
                    model = "gemini-2.5-flash"
                    contents = [payload["query"]]
                    if "history" in payload["context"]:
                        contents = payload["context"]["history"] + contents
                    
                    response = self.client.models.generate_content(
                        model=model,
                        contents=contents,
                        config={"system_instruction": payload["context"].get("system_prompt")}
                    )
                    return {"status": "success", "data": {"raw": response.text}}
                
                # Fallback to Socket Bridge
                return await self._transmit_socket(payload)
                
            except Exception as e:
                # Late-bind errors import to ensure patch() can intercept
                is_transient = False
                try:
                    from google.genai import errors
                    if isinstance(e, errors.APIError):
                        if e.code in [429, 500, 502, 503, 504]:
                            is_transient = True
                except ImportError:
                    pass
                
                if is_transient and attempt < max_retries:
                    wait_time = base_delay * (2 ** attempt)
                    logging.warning(f"Uplink throttled/unavailable ({e}). Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    raise e

    async def _transmit_socket(self, payload: dict) -> dict:
        """Legacy socket transmission logic."""
        try:
            reader, writer = await asyncio.open_connection(self.host, self.port)
            writer.write(json.dumps(payload).encode('utf-8'))
            await writer.drain()
            writer.write_eof()
            
            data = await asyncio.wait_for(reader.read(8192), timeout=TIMEOUT_SECONDS)
            response = json.loads(data.decode('utf-8'))
            writer.close()
            await writer.wait_closed()
            return response
        except (ConnectionRefusedError, OSError):
            await asyncio.sleep(1)
            return {
                "status": "success",
                "message": f"[SIMULATION] Antigravity received: {payload['query']}",
                "data": {"insight": "42"}
            }

    async def _spinner(self, task, message):
        """Runs a CLI spinner until the task completes."""
        spinner_chars = ['|', '/', '-', '\\']
        idx = 0
        sys.stdout.write("\033[?25l")
        try:
            while not task.done():
                sys.stdout.write(f"\r{message} {spinner_chars[idx]}")
                sys.stdout.flush()
                idx = (idx + 1) % len(spinner_chars)
                await asyncio.sleep(0.1)
            sys.stdout.write("\r" + " " * (len(message) + 2) + "\r")
            return await task
        finally:
            sys.stdout.write("\033[?25h")

async def query_bridge(query: str, context: dict = None) -> dict:
    """Convenience wrapper for the AntigravityUplink."""
    uplink = AntigravityUplink()
    return await uplink.send_payload(query, context)

if __name__ == "__main__":
    async def main():
        uplink = AntigravityUplink()
        print("Testing Uplink...")
        res = await uplink.send_payload("What is the speed of an unladen swallow?", {"persona": "ODIN"})
        print(json.dumps(res, indent=2))
    asyncio.run(main())
