"""
[Ω] Antigravity Bridge (v5.2) - THE HYBRID ORACLE
Lore: "Mimir's Head speaks only in the silence of the night."
Mandate: Connect Daemon/Muninn directly to the Active Agent via file handshake
         while providing a Fast-Path for bulk repository intelligence.
"""

import asyncio
import json
import logging
import os
import uuid
import re
import tempfile
from logging.handlers import RotatingFileHandler
from typing import Any
from pathlib import Path

HOST = '127.0.0.1'
PORT = 50052
LOG_FILE = ".agent/bridge.log"
INBOX_FILE = Path(".agent/oracle_inbox.json")
OUTBOX_FILE = Path(".agent/oracle_outbox.json")
DEFAULT_TIMEOUT = 300.0  # seconds

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
    [Ω] The Hybrid Oracle Proxy.
    Automates bulk intelligence (INTENT) while handshaking for missions.
    """

    @staticmethod
    def clean_cli_output(text: str) -> str:
        return clean_cli_output(text)

    @staticmethod
    async def _fast_path_intelligence(query: str, persona: str, api_key: str | None = None) -> dict:
        """Invokes the Gemini CLI directly for fast, non-interactive intelligence."""
        # Use temporary files for all streams to prevent PIPE deadlock
        out_fd, out_path = tempfile.mkstemp(suffix=".out")
        err_fd, err_path = tempfile.mkstemp(suffix=".err")
        os.close(out_fd)
        os.close(err_fd)
        
        env = os.environ.copy()
        env["TERM"] = "dumb"
        env["NO_COLOR"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        if api_key: env["GEMINI_API_KEY"] = api_key

        try:
            entry_point = r"C:\Users\Craig\AppData\Roaming\npm\node_modules\@google\gemini-cli\dist\index.js"
            safe_query = query.replace('"', '\\"')
            # [Ω] Fast-Path: Use --no-tools and direct execution
            cmd = f'node --no-warnings "{entry_point}" --no-tools --output-format json -p "{safe_query}" < NUL > "{out_path}" 2> "{err_path}"'
            
            proc = await asyncio.create_subprocess_shell(cmd, env=env)
            await asyncio.wait_for(proc.wait(), timeout=120.0) # 2m limit for fast-path
            
            with open(out_path, "r", encoding="utf-8", errors="replace") as f:
                raw = f.read()
            
            json_str = clean_cli_output(raw)
            if not json_str:
                return {"status": "error", "message": "Fast-Path Void Response"}
            
            try:
                data = json.loads(json_str)
                response_text = data.get("response") or data.get("content") or str(data)
                return {"status": "success", "data": {"raw": response_text}}
            except json.JSONDecodeError:
                return {"status": "error", "message": "JSON Corruption in Fast-Path"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
        finally:
            for p in [out_path, err_path]:
                if os.path.exists(p): os.remove(p)

    @staticmethod
    async def process_request(query: str, persona: str, api_key: str | None = None) -> dict:
        """Decides between Fast-Path and Oracle Handshake."""
        
        # [Ω] LOGIC: If it's a bulk intent request, use the Fast-Path
        if "INTENT" in query.upper() and "FIX" not in query.upper() and "TEST" not in query.upper():
            logger.info(f"Uplink: Routing to Fast-Path Intelligence ({persona})")
            return await AntigravityBridge._fast_path_intelligence(query, persona, api_key)

        # [Ω] MISSION: Use the Oracle Handshake
        request_id = str(uuid.uuid4())
        inbox_payload = { "id": request_id, "persona": persona, "query": query, "status": "pending" }
        INBOX_FILE.write_text(json.dumps(inbox_payload, indent=2), encoding="utf-8")
        
        import sys
        print(f"\n{'='*60}", file=sys.stderr)
        print(f" 🛎️ [ORACLE REQUIRED] Mission: {request_id}", file=sys.stderr)
        print(f" Action Required: Read {INBOX_FILE}", file=sys.stderr)
        print(f" To resume: Write response to {OUTBOX_FILE}", file=sys.stderr)
        print(f"{'='*60}\n", file=sys.stderr)
        sys.stderr.flush()
        
        logger.info(f"Uplink: Request {request_id} queued for Oracle ({persona}). Waiting...")

        poll_interval = 1.0
        max_wait = 600.0
        elapsed = 0.0
        
        while elapsed < max_wait:
            if OUTBOX_FILE.exists():
                try:
                    outbox_data = json.loads(OUTBOX_FILE.read_text(encoding="utf-8"))
                    if outbox_data.get("id") == request_id:
                        logger.info(f"Uplink: Oracle response received for {request_id}")
                        if INBOX_FILE.exists(): INBOX_FILE.unlink()
                        if OUTBOX_FILE.exists(): OUTBOX_FILE.unlink()
                        raw_response = outbox_data.get("response", "")
                        return {"status": "success", "data": {"raw": raw_response}}
                except Exception: pass
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            
        if INBOX_FILE.exists(): INBOX_FILE.unlink()
        logger.error(f"Oracle Timeout for {request_id}")
        return {"status": "error", "message": "Oracle Timeout"}

    @staticmethod
    async def process_request_with_retry(query: str, persona: str, api_key: str | None = None) -> dict[str, Any]:
        """API Compatibility Wrapper."""
        return await AntigravityBridge.process_request(query, persona, api_key)

    @staticmethod
    async def handle_client(reader, writer):
        """Processes incoming bridge requests."""
        try:
            # 1MB buffer for large code payloads
            data = await reader.read(1024 * 1024)
            if not data: return
            
            payload = json.loads(data.decode())
            query = payload.get("query", "")
            persona = payload.get("context", {}).get("persona", "ALFRED")
            api_key = payload.get("api_key")
            
            response = await AntigravityBridge.process_request(query, persona, api_key)
            
            writer.write(json.dumps(response).encode())
            await writer.drain()
        except Exception as e:
            logger.error(f"Handle Client Error: {e}")
        finally:
            writer.close()

async def main():
    server = await asyncio.start_server(AntigravityBridge.handle_client, HOST, PORT)
    logger.info(f"Bridge ACTIVE on port {PORT} (Hybrid Oracle Mode)")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
