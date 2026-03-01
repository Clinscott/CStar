
import asyncio
import json
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path

import websockets
from websockets.server import serve

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent.absolute()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# Core Imports
from src.core.sovereign_hud import SovereignHUD
from src.core.sv_engine import SovereignEngine
from src.cstar.core.uplink import AntigravityUplink

# Constants
HOST = "127.0.0.1"
PORT = int(os.getenv("CSTAR_DAEMON_PORT", "50051"))
PID_FILE = PROJECT_ROOT / ".agent" / "daemon.pid"
KEY_FILE = PROJECT_ROOT / ".agent" / "daemon.key"

# Global State
SESSION_TRACES = []
ACTIVE_CLIENTS = set()
AUTH_KEY = None
ENGINE = None
UPLINK = AntigravityUplink()

# Command Registry (Internal)
COMMAND_REGISTRY = {
    "ping": "src/tools/debug/ping_telemetry.py",
    "stats": "src/tools/trace_viz.py",
    "wrap": "src/tools/wrap_it_up.py"
}

def engine_search_sync(query: str):
    """Synchronous wrapper for vector search to avoid async complexity in routing."""
    global ENGINE
    if not ENGINE:
        ENGINE = SovereignEngine(project_root=PROJECT_ROOT)
        ENGINE._init_vector_engine()
    
    # Deterministic Command Check
    cmd_key = query.strip().lower().split()[0]
    if cmd_key in COMMAND_REGISTRY:
        return {
            "status": "success",
            "type": "deterministic",
            "target": COMMAND_REGISTRY[cmd_key]
        }, None, 1.0

    return ENGINE.search(query)

async def process_command(query: str, history: list, context_path: str) -> dict:
    """Central processing logic for all incoming commands."""
    global SESSION_TRACES
    
    # 1. Vector/Deterministic Search
    res, top, score = engine_search_sync(query)
    
    # 2. High Confidence Deterministic Route
    if res and res.get("type") == "deterministic":
        return res

    # 3. Fallback to Antigravity Uplink (Alfred)
    if score < 0.7:
        SovereignHUD.persona_log("ALFRED", f"Uncertain intent (Score: {score:.2f}). Consulting the Bridge...")
        uplink_res = await UPLINK.send_payload(query, {"persona": "ALFRED", "history": history})
        
        if uplink_res.get("status") == "success":
            return {
                "status": "uplink_success",
                "type": "uplink",
                "response": uplink_res["data"]["raw"]
            }
    
    return {"status": "error", "message": "Command not recognized and uplink uncertain."}

async def handle_client(websocket):
    """Handles persistent WebSocket connections with authentication."""
    global ACTIVE_CLIENTS
    ACTIVE_CLIENTS.add(websocket)
    authenticated = False
    
    try:
        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "auth":
                if data.get("auth_key") == AUTH_KEY:
                    authenticated = True
                    await websocket.send(json.dumps({"type": "auth_success"}))
                else:
                    await websocket.send(json.dumps({"type": "auth_fail"}))
                    return

            if not authenticated:
                continue

            if msg_type == "command":
                query = data.get("query")
                history = data.get("history", [])
                path = data.get("path", ".")
                
                response = await process_command(query, history, path)
                await websocket.send(json.dumps({
                    "type": "command_response",
                    "data": response
                }))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        ACTIVE_CLIENTS.remove(websocket)

async def execute_sleep_protocol():
    """Finalizes session and persists state."""
    SovereignHUD.persona_log("HEIMDALL", "Sleep Protocol Initiated. Persisting neural traces...")
    
    trace_path = PROJECT_ROOT / ".agent" / "traces" / f"session_{int(time.time())}.json"
    trace_path.write_text(json.dumps(SESSION_TRACES, indent=2))
    
    # Trigger PennyOne Archival
    subprocess.Popen([sys.executable, "src/tools/compile_session_traces.py"], cwd=str(PROJECT_ROOT))

async def async_start_daemon():
    global AUTH_KEY
    
    # 1. Initialize Security
    AUTH_KEY = secrets.token_urlsafe(32)
    KEY_FILE.write_text(AUTH_KEY)
    PID_FILE.write_text(str(os.getpid()))
    
    SovereignHUD.transition_ceremony("SYSTEM", "MUNINN")
    SovereignHUD.persona_log("INFO", f"Muninn Daemon active on ws://{HOST}:{PORT}")
    
    async with serve(handle_client, HOST, PORT):
        await asyncio.Future()  # run forever

def start_daemon() -> None:
    """Main daemon entry point."""
    try:
        asyncio.run(async_start_daemon())
    except KeyboardInterrupt:
        asyncio.run(execute_sleep_protocol())
    finally:
        if PID_FILE.exists():
            PID_FILE.unlink()

if __name__ == "__main__":
    start_daemon()
