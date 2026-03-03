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

# Add project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.absolute()
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

# Singleton for functional compatibility
_daemon_singleton = None

def get_daemon():
    global _daemon_singleton
    if _daemon_singleton is None:
        _daemon_singleton = CStarDaemon()
    return _daemon_singleton

# Legacy Constants for Test Compatibility
COMMAND_REGISTRY = {
    "ping": "src/tools/debug/ping_telemetry.py",
    "stats": "src/tools/trace_viz.py",
    "wrap": "src/tools/wrap_it_up.py"
}
UPLINK = AntigravityUplink()
ENGINE = None # Lazy initialized in get_daemon().engine
SESSION_TRACES = [] # Synced with get_daemon().session_traces

def engine_search_sync(query: str):
    return get_daemon().engine_search_sync(query)

async def process_command(query: str, history: list, context_path: str, command: str = "command", args: list = None) -> dict:
    return await get_daemon().process_command(query, history, context_path, command, args)

async def execute_sleep_protocol():
    return await get_daemon().execute_sleep_protocol()

class CStarDaemon:
    """[O.D.I.N.] Orchestration logic for the CStar background daemon and persistent WebSocket relay."""

    def __init__(self) -> None:
        self.session_traces = []
        self.active_clients = set()
        self.auth_key = None
        self.engine = None
        self.uplink = AntigravityUplink()
        self.command_registry = {
            "ping": "src/tools/debug/ping_telemetry.py",
            "stats": "src/tools/trace_viz.py",
            "wrap": "src/tools/wrap_it_up.py"
        }

    def engine_search_sync(self, query: str):
        """Synchronous wrapper for vector search to avoid async complexity in routing."""
        if not self.engine:
            self.engine = SovereignEngine(project_root=PROJECT_ROOT)
        
        # Deterministic Command Check
        cmd_key = query.strip().lower().split()[0]
        if cmd_key in self.command_registry:
            return {
                "status": "success",
                "type": "deterministic",
                "target": self.command_registry[cmd_key]
            }, None, 1.0

        # Delegate search to the engine's internal vector processor
        # Note: In V6, SovereignEngine.engine is the raw vector engine
        return self.engine.engine.search(query)

    async def broadcast_event(self, event_type: str, payload: dict):
        """Broadcasts an event to all connected WebSocket clients."""
        if not self.active_clients:
            return
        msg = json.dumps({"type": event_type, "payload": payload})
        for client in list(self.active_clients):
            try:
                await client.send(msg)
            except Exception:
                pass

    async def process_command(self, query: str, history: list, context_path: str, command: str = "command", args: list = None) -> dict:
        """Central processing logic for all incoming commands."""
        if command == "ask":
            task_desc = args[0] if args else query
            target_file = args[1] if len(args) > 1 else ""
            
            # [Ω] PennyOne Integration: Fetch metrics for context
            metrics_context = {}
            try:
                from src.sentinel.coordinator import MissionCoordinator
                ledger_path = PROJECT_ROOT / ".agent" / "tech_debt_ledger.json"
                if ledger_path.exists():
                    ledger = json.loads(ledger_path.read_text())
                    file_stats = next((t for t in ledger.get("top_targets", []) if t["file"].endswith(target_file)), None)
                    if file_stats:
                        metrics_context = file_stats.get("metrics", {})
            except Exception: pass

            prompt = f"Task: {task_desc}\nFile: {target_file}\nMetrics: {json.dumps(metrics_context)}\n"
            SovereignHUD.persona_log("ALFRED", f"Foraging solution for {target_file}...")
            
            uplink_res = await self.uplink.send_payload(prompt, {"persona": "ODIN", "metrics": metrics_context})
            return uplink_res

        if command == "verify":
            candidate_path = args[0] if args else ""
            SovereignHUD.persona_log("HEIMDALL", f"Verifying candidate: {candidate_path}")
            
            from src.sentinel.muninn import Muninn
            muninn = Muninn(target_path=str(PROJECT_ROOT))
            success = muninn._verify_fix({"file": candidate_path, "action": "Verification via Daemon"})
            
            if success:
                await self.broadcast_event("FORGE_COMPLETE", {"file": candidate_path})
                
            return {"status": "success" if success else "error", "message": "Crucible verified" if success else "Crucible failed"}

        # 1. Vector/Deterministic Search
        res, top, score = self.engine_search_sync(query)
        
        # 2. High Confidence Deterministic Route
        if res and res.get("type") == "deterministic":
            return res

        # 3. Fallback to Antigravity Uplink (Alfred)
        if score < 0.7:
            SovereignHUD.persona_log("ALFRED", f"Uncertain intent (Score: {score:.2f}). Consulting the Bridge...")
            uplink_res = await self.uplink.send_payload(query, {"persona": "ALFRED", "history": history})
            
            if uplink_res.get("status") == "success":
                return {
                    "status": "uplink_success",
                    "type": "uplink",
                    "response": uplink_res["data"]["raw"]
                }
        
        return {"status": "error", "message": "Command not recognized and uplink uncertain."}

    async def handle_client(self, websocket):
        """Handles persistent WebSocket connections with authentication."""
        self.active_clients.add(websocket)
        authenticated = False
        
        try:
            async for message in websocket:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "auth":
                    if data.get("auth_key") == self.auth_key:
                        authenticated = True
                        await websocket.send(json.dumps({"type": "auth_success"}))
                    else:
                        await websocket.send(json.dumps({"type": "auth_fail"}))
                        return

                if not authenticated:
                    continue

                if msg_type == "command" or "command" in data:
                    cmd = data.get("command", "command")
                    args = data.get("args", [])
                    query = data.get("query", args[0] if args else "")
                    history = data.get("history", [])
                    path = data.get("cwd", data.get("path", "."))
                    
                    response = await self.process_command(query, history, path, command=cmd, args=args)
                    await websocket.send(json.dumps({
                        "type": "result",
                        "data": response
                    }))

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.active_clients.remove(websocket)

    async def execute_sleep_protocol(self):
        """Finalizes session and persists state."""
        SovereignHUD.persona_log("HEIMDALL", "Sleep Protocol Initiated. Persisting neural traces...")
        
        trace_path = PROJECT_ROOT / ".agent" / "traces" / f"session_{int(time.time())}.json"
        trace_path.parent.mkdir(parents=True, exist_ok=True)
        trace_path.write_text(json.dumps(self.session_traces, indent=2))
        
        subprocess.Popen([sys.executable, "src/tools/compile_session_traces.py"], cwd=str(PROJECT_ROOT))

    async def async_start_daemon(self):
        # 1. Initialize Security
        self.auth_key = secrets.token_urlsafe(32)
        KEY_FILE.write_text(self.auth_key)
        PID_FILE.write_text(str(os.getpid()))
        
        SovereignHUD.transition_ceremony("SYSTEM", "MUNINN")
        SovereignHUD.persona_log("INFO", f"Muninn Daemon active on ws://{HOST}:{PORT}")
        
        async with serve(self.handle_client, HOST, PORT):
            await asyncio.Future()

    def start(self) -> None:
        """Main daemon entry point."""
        try:
            asyncio.run(self.async_start_daemon())
        except KeyboardInterrupt:
            asyncio.run(self.execute_sleep_protocol())
        finally:
            if PID_FILE.exists():
                PID_FILE.unlink()

if __name__ == "__main__":
    daemon = CStarDaemon()
    daemon.start()
