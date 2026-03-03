"""
[Ω] Antigravity Bridge (v5.1) - THE ORACLE HANDSHAKE
Lore: "Mimir's Head speaks only in the silence of the night."
Mandate: Connect Daemon/Muninn directly to the Active Agent via file handshake.
"""

import asyncio
import asyncio
import json
import logging
import os
import re
import uuid
import tempfile
from logging.handlers import RotatingFileHandler
from typing import Any
from pathlib import Path

HOST = '127.0.0.1'
PORT = 50052
LOG_FILE = ".agent/bridge.log"
INBOX_FILE = Path(".agent/oracle_inbox.json")
OUTBOX_FILE = Path(".agent/oracle_outbox.json")
DEFAULT_TIMEOUT = 300.0  # Keep for compatibility

# Ensure .agent exists
Path(".agent").mkdir(exist_ok=True)

logger = logging.getLogger('antigravity_bridge')
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)

def clean_cli_output(text: str) -> str:
    """Strips ANSI codes and extracts the LAST full JSON object via brace counting."""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    text = ansi_escape.sub('', text)

    try:
        # Use regex with DOTALL for multi-line JSON
        matches = list(re.finditer(r'\{(?:[^{}]|(?R))*\}', text, re.DOTALL))
        if matches:
            return matches[-1].group(0)
    except Exception:
        # Fallback brace counter
        end_idx = text.rfind('}')
        if end_idx == -1: return ""
        stack = 0
        for i in range(end_idx, -1, -1):
            if text[i] == '}': stack += 1
            elif text[i] == '{': stack -= 1
            if stack == 0:
                return text[i:end_idx+1]
    return ""

class AntigravityBridge:
    """
    [Ω] The Oracle State Handshake Proxy.
    Writes requests to the inbox and waits for the active agent to respond.
    """

    @staticmethod
    def clean_cli_output(text: str) -> str:
        return clean_cli_output(text)

    @staticmethod
    async def process_request(query: str, persona: str, api_key: str | None = None) -> dict:

        """Writes to inbox and polls outbox."""
        request_id = str(uuid.uuid4())
        
        inbox_payload = {
            "id": request_id,
            "persona": persona,
            "query": query,
            "status": "pending"
        }
        
        # 1. Write to Inbox
        INBOX_FILE.write_text(json.dumps(inbox_payload, indent=2), encoding="utf-8")
        
        # 2. Alert the Harness / Active Agent
        import sys
        print(f"\n{'='*60}", file=sys.stderr)
        print(f" 🛎️ [ORACLE REQUIRED] Mission for {persona}", file=sys.stderr)
        print(f" ID: {request_id}", file=sys.stderr)
        print(f" Action Required: Read {INBOX_FILE}", file=sys.stderr)
        print(f" To resume: Write response to {OUTBOX_FILE}", file=sys.stderr)
        print(f" Ensure response is JSON: {{ \"id\": \"{request_id}\", \"response\": \"...\" }}", file=sys.stderr)
        print(f"{'='*60}\n", file=sys.stderr)
        sys.stderr.flush()
        
        logger.info(f"Uplink: Request {request_id} queued for Oracle ({persona}). Waiting...")

        # 3. Poll for Outbox
        poll_interval = 1.0
        max_wait = 600.0  # Wait up to 10 minutes for the active agent
        elapsed = 0.0
        
        while elapsed < max_wait:
            if OUTBOX_FILE.exists():
                try:
                    outbox_data = json.loads(OUTBOX_FILE.read_text(encoding="utf-8"))
                    if outbox_data.get("id") == request_id:
                        logger.info(f"Uplink: Oracle response received for {request_id}")
                        
                        # Cleanup
                        if INBOX_FILE.exists(): INBOX_FILE.unlink()
                        if OUTBOX_FILE.exists(): OUTBOX_FILE.unlink()
                        
                        raw_response = outbox_data.get("response", "")
                        json_str = AntigravityBridge.clean_cli_output(raw_response)
                        return {"status": "success", "data": {"raw": json_str}}
                except json.JSONDecodeError:
                    # File might be partially written, ignore and retry next tick
                    pass
                except Exception as e:
                    logger.error(f"Error reading outbox: {e}")
            
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            
        # Cleanup on timeout
        if INBOX_FILE.exists(): INBOX_FILE.unlink()
        if OUTBOX_FILE.exists(): OUTBOX_FILE.unlink()
        logger.error(f"Oracle Timeout: Active agent did not respond within {max_wait}s.")
        return {"status": "error", "message": f"Oracle Timeout ({max_wait}s)"}

    @staticmethod
    def clean_cli_output(text: str) -> str:
        """Strips ANSI codes and extracts the LAST full JSON object via brace counting."""
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        text = ansi_escape.sub('', text)
        
        try:
            matches = list(re.finditer(r'\{(?:[^{}]|(?R))*\}', text, re.DOTALL))
            if matches:
                return matches[-1].group(0)
        except Exception:
            end_idx = text.rfind('}')
            if end_idx == -1: return ""
            stack = 0
            for i in range(end_idx, -1, -1):
                if text[i] == '}': stack += 1
                elif text[i] == '{': stack -= 1
                if stack == 0:
                    return text[i:end_idx+1]
        return ""

    @staticmethod
    async def process_request_with_retry(query: str, persona: str, api_key: str | None = None) -> dict[str, Any]:
        """Wrapper. Retries are less relevant here but kept for API compatibility."""
        return await AntigravityBridge.process_request(query, persona, api_key)

    @staticmethod
    async def handle_client(reader, writer):
        """Processes incoming bridge requests."""
        try:
            # Increase buffer to 1MB to handle large code payloads
            data = await reader.read(1024 * 1024)
            if not data: return
            
            payload = json.loads(data.decode())
            query = payload.get("query", "")
            persona = payload.get("context", {}).get("persona", "ALFRED")
            api_key = payload.get("api_key")
            
            response = await AntigravityBridge.process_request_with_retry(query, persona, api_key)
            
            writer.write(json.dumps(response).encode())
            await writer.drain()
        except Exception as e:
            logger.error(f"Handle Client Error: {e}")
        finally:
            writer.close()

async def main():
    server = await asyncio.start_server(AntigravityBridge.handle_client, HOST, PORT)
    logger.info(f"Bridge ACTIVE on port {PORT} (Oracle Handshake Mode)")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
