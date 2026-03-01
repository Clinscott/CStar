"""
[Ω] Antigravity Bridge (v4.7) - THE GHOST PROXY
Lore: "Mimir's Head speaks only in the silence of the night."
Mandate: NO TERMINAL OUTPUT. NO TUI. NO EXCEPTIONS.
"""

import asyncio
import json
import logging
import re
import subprocess
import sys
import tempfile
import os
from pathlib import Path

# Constants
HOST = '127.0.0.1'
PORT = 50052
LOG_FILE = ".agent/bridge.log"

# Ensure .agent exists
Path(".agent").mkdir(exist_ok=True)

# Configure Logging to File Only
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

def clean_cli_output(text: str) -> str:
    """Strips ANSI codes and extracts the LAST full JSON object via brace counting."""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    text = ansi_escape.sub('', text)
    
    # We find the start of the last potential JSON object
    # Counting backwards to find the matching opening brace
    end_idx = text.rfind('}')
    if end_idx == -1: return ""
    
    stack = 0
    for i in range(end_idx, -1, -1):
        if text[i] == '}': stack += 1
        elif text[i] == '{': stack -= 1
        
        if stack == 0:
            return text[i:end_idx+1]
            
    return ""

async def process_request(query: str, persona: str) -> dict:
    """Invokes the Gemini CLI in a truly headless, silent state."""
    entry_point = r"C:\Users\Craig\AppData\Roaming\npm\node_modules\@google\gemini-cli\dist\index.js"
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    
    # Force a dumb terminal environment to kill the TUI
    env = os.environ.copy()
    env["TERM"] = "dumb"
    env["NO_COLOR"] = "1"

    try:
        # THE SOVEREIGN COMMAND:
        # We call Node directly and redirect ALL streams to the file at the shell level
        cmd = f'node --no-warnings "{entry_point}" -m gemini-2.0-flash --output-format json --approval-mode auto_edit -p "{query}" < NUL > "{path}" 2>&1'
        
        logging.info(f"Uplink: Synchronizing with {persona}...")
        
        proc = await asyncio.create_subprocess_shell(
            cmd,
            env=env,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        await asyncio.wait_for(proc.wait(), timeout=90.0)
        
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            raw = f.read()
            
        json_str = clean_cli_output(raw)
        if not json_str:
            return {"status": "error", "message": "The void is silent."}
            
        data = json.loads(json_str)
        return {"status": "success", "data": {"raw": data.get("response", "No response.")}}

    except Exception as e:
        logging.error(f"Uplink Severed: {e}")
        return {"status": "error", "message": f"Uplink Severed: {e}"}
    finally:
        if os.path.exists(path):
            os.remove(path)

async def handle_client(reader, writer):
    try:
        data = await reader.read(8192)
        if not data: return
        
        payload = json.loads(data.decode())
        query = payload.get("query", "")
        persona = payload.get("context", {}).get("persona", "ALFRED")
        
        response = await process_request(query, persona)
        
        writer.write(json.dumps(response).encode())
        await writer.drain()
    except Exception as e:
        logging.error(f"Handle Client Error: {e}")
    finally:
        writer.close()

async def main():
    server = await asyncio.start_server(handle_client, HOST, PORT)
    logging.info(f"Bridge ACTIVE on port {PORT} (Ghost Mode)")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
