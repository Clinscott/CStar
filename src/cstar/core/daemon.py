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
from src.core.mimir_client import mimir

# Constants
HOST = "127.0.0.1"
PORT = int(os.getenv("CSTAR_DAEMON_PORT", "50051"))
# If port is 0, we'll let the OS decide and we'll need to report it back or use a fixed one if 0 not supported by websockets serve easily
# Actually websockets.serve(..., port=0) works and we can get the port from the server object.
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
        self.stop_event = asyncio.Event()
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
        if command == "NORN_POLL":
            # [🧵] The Ledger of the Norns: Autonomous Task Plucking
            from src.core.norn_coordinator import NornCoordinator
            from src.core.engine.cognitive_router import CognitiveRouter
            
            coordinator = NornCoordinator(PROJECT_ROOT)
            coordinator.sync_tasks()
            
            router = CognitiveRouter(PROJECT_ROOT)
            bead = coordinator.get_next_bead(router.agent_id)
            
            if not bead:
                SovereignHUD.persona_log("HEIMDALL", "The Ledger is empty. No OPEN beads remain.")
                return {"status": "success", "message": "No tasks available."}
                
            SovereignHUD.persona_log("LOKI", f"Plucked Bead #{bead['id']}: {bead['description']}")
            
            start_time = time.time()
            router_result = await router.route_intent(bead['description'], target_file="", loki_mode=True)
            
            if router_result.get("status") == "success":
                coordinator.resolve_bead(bead['id'])
                SovereignHUD.persona_log("SUCCESS", f"Bead #{bead['id']} resolved and committed.")
            else:
                SovereignHUD.persona_log("ERROR", f"Failed to resolve Bead #{bead['id']}.")
                
            return router_result

        if command == "ask":
            task_desc = args[0] if args else query
            target_file = args[1] if len(args) > 1 else ""
            mode_flag = args[2] if len(args) > 2 else "STANDARD"
            
            is_batch = target_file == "BATCH_ANALYSIS"
            is_loki = mode_flag == "LOKI_MODE"
            
            # [ALFRED]: "We skip cognitive routing for internal batch analysis to avoid recursive dependency, sir."
            if is_batch:
                prompt = f"Task: {task_desc}\nFile: {target_file}\n"
                return await self.uplink.send_payload(prompt, {"persona": "ODIN"})

            # [🔱] THE ONE MIND: Intercept and route via Cognitive Router
            if is_loki:
                SovereignHUD.persona_log("LOKI", "Autonomous Velocity Active. Bypassing human-in-the-loop.")
            else:
                SovereignHUD.persona_log("HEIMDALL", "Intercepting prompt via One Mind Cognitive Router...")
                
            from src.core.engine.cognitive_router import CognitiveRouter
            router = CognitiveRouter(PROJECT_ROOT)
            
            start_time = time.time()
            
            # Pass loki_mode to the router
            router_result = await router.route_intent(task_desc, target_file, loki_mode=is_loki)
            
            # [🔱] CORVUS STAR TRACE PROTOCOL: Persistent Intent Recording
            try:
                from src.core.telemetry import SubspaceTelemetry
                status = "SUCCESS" if router_result.get("status") == "success" else "ERROR"
                SubspaceTelemetry.log_trace(
                    mission_id=f"ONE-MIND-{int(start_time)}",
                    file_path=target_file or "SYSTEM",
                    target_metric="COGNITIVE_ROUTING",
                    initial_score=0.0,
                    justification=task_desc[:200],
                    status=status,
                    final_score=1.0 if status == "SUCCESS" else 0.0
                )
                
                # Internal Session Tracking
                self.session_traces.append({
                    "timestamp": start_time,
                    "target": target_file,
                    "task": task_desc,
                    "response_status": router_result.get("status")
                })
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Trace Protocol failed: {e}")

            return router_result

        if command == "verify":
            candidate_path = args[0] if args else ""
            SovereignHUD.persona_log("HEIMDALL", f"Verifying candidate: {candidate_path}")
            
            from src.sentinel.muninn import Muninn
            muninn = Muninn(target_path=str(PROJECT_ROOT))
            success = muninn._verify_fix({"file": candidate_path, "action": "Verification via Daemon"})
            
            if success:
                await self.broadcast_event("FORGE_COMPLETE", {"file": candidate_path})
                
            return {"status": "success" if success else "error", "message": "Crucible verified" if success else "Crucible failed"}

        if command == "PHYSICAL_MOVE_REQUEST":
            source_path = args[0]
            target_path = args[1]
            
            # Zero-Trust Validation
            abs_source = (PROJECT_ROOT / source_path).resolve()
            abs_target = (PROJECT_ROOT / target_path).resolve()
            
            if PROJECT_ROOT not in abs_source.parents or PROJECT_ROOT not in abs_target.parents:
                SovereignHUD.persona_log("HEIMDALL", f"BREACH: Path traversal attempted in physical move: {source_path} -> {target_path}")
                return {"status": "MOVE_FAIL", "message": "Path Traversal Blocked."}
                
            try:
                import shutil
                # Ensure target directory exists
                abs_target.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(abs_source), str(abs_target))
                SovereignHUD.persona_log("ODIN", f"Physical Move Executed: {source_path} -> {target_path}")
                return {"status": "MOVE_SUCCESS", "message": "File moved successfully."}
            except (PermissionError, FileNotFoundError, OSError) as e:
                SovereignHUD.persona_log("HEIMDALL", f"Physical Move Failed: {e}")
                return {"status": "MOVE_FAIL", "message": str(e)}

        if command == "FATAL_ROLLBACK":
            source_path = args[0] # Original source
            target_path = args[1] # Target where it currently is
            
            abs_source = (PROJECT_ROOT / source_path).resolve()
            abs_target = (PROJECT_ROOT / target_path).resolve()
            
            if PROJECT_ROOT in abs_source.parents and PROJECT_ROOT in abs_target.parents:
                try:
                    import shutil
                    if abs_target.exists():
                        shutil.move(str(abs_target), str(abs_source))
                        SovereignHUD.persona_log("HEIMDALL", f"Fatal Rollback Executed. Restored to: {source_path}")
                except Exception as e:
                    SovereignHUD.persona_log("HEIMDALL", f"Fatal Rollback FAILED: {e}. MANUAL INTERVENTION REQUIRED.")
            return {"status": "ROLLBACK_COMPLETE"}

        if command == "GHOST_PULSE":
            file_path = args[0]
            content = args[1]
            
            from src.sentinel.wardens.ghost_warden import GhostWarden
            warden = GhostWarden(PROJECT_ROOT)
            result = warden.adjudicate(file_path, content)
            
            return {"status": "success", "data": result}

        if command == "shutdown":
            SovereignHUD.persona_log("HEIMDALL", "Remote Shutdown Signal Received.")
            # We schedule the sleep protocol and exit
            asyncio.get_event_loop().call_later(0.1, self.stop_event.set)
            return {"status": "success", "message": "Shutdown initiated."}

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
                        SovereignHUD.persona_log("HEIMDALL", "Synaptic Authentication Successful.")
                        await websocket.send(json.dumps({"type": "auth_success"}))
                    else:
                        SovereignHUD.persona_log("HEIMDALL", "Synaptic Authentication Failed: Invalid Key.")
                        await websocket.send(json.dumps({"type": "auth_fail"}))
                        return

                if not authenticated:
                    continue

                if msg_type == "command" or "command" in data:
                    cmd = data.get("command", "command")
                    args = data.get("args", [])
                    SovereignHUD.persona_log("INFO", f"Oracle processing synaptic command: {cmd}")
                    
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
        
        # [🔱] THE BRAIN: Close Synapses
        try:
            await mimir.close()
        except Exception: pass

        trace_path = PROJECT_ROOT / ".agent" / "traces" / f"session_{int(time.time())}.json"
        trace_path.parent.mkdir(parents=True, exist_ok=True)
        trace_path.write_text(json.dumps(self.session_traces, indent=2))
        
        # Skip background trace compilation if running under automated tests
        if os.getenv("NODE_ENV") == "test" or os.getenv("CSTAR_TEST_MODE") == "1":
            SovereignHUD.persona_log("HEIMDALL", "[TEST MODE] Skipping background trace compilation.")
            return

        subprocess.Popen([sys.executable, "src/tools/compile_session_traces.py"], cwd=str(PROJECT_ROOT))

    async def async_start_daemon(self):
        # 1. Initialize Security
        self.auth_key = secrets.token_urlsafe(32)
        KEY_FILE.write_text(self.auth_key)
        PID_FILE.write_text(str(os.getpid()))
        
        SovereignHUD.transition_ceremony("SYSTEM", "MUNINN")
        SovereignHUD.persona_log("INFO", f"Muninn Daemon active on ws://{HOST}:{PORT}")
        
        async with serve(self.handle_client, HOST, PORT):
            await self.stop_event.wait()
        
        # Once stopped, run sleep protocol
        await self.execute_sleep_protocol()

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