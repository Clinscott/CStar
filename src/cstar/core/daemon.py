import asyncio
import gc
import json
import os
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import psutil
import websockets

# Add project root to path for src imports
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import contextlib

from src.core.engine.vector import SovereignVector
from src.core.payload import IntentPayload
from src.cstar.core.forge import Forge
from src.cstar.core.rpc import SovereignRPC
from src.cstar.core.uplink import AntigravityUplink
from src.sentinel._bootstrap import bootstrap

# Initialize Environment
bootstrap()

# Constants
HOST = '127.0.0.1'
PORT = int(os.getenv("CSTAR_DAEMON_PORT", 50051))
MEMORY_LIMIT_MB = 256
PID_FILE = project_root / ".agent" / "daemon.pid"
KEY_FILE = project_root / ".agent" / "daemon.key"

CONFIDENCE_THRESHOLD = 0.4
AMBIGUITY_THRESHOLD = 0.1

# Global State
ENGINE: SovereignVector | None = None
COMMAND_REGISTRY: dict[str, str] = {}
UPLINK = AntigravityUplink(api_key=os.getenv("GOOGLE_API_DAEMON_KEY") or os.getenv("GOOGLE_API_KEY"))
RPC: SovereignRPC | None = None
WARDEN: Any = None
SESSION_TRACES: list[dict[str, Any]] = []

# WebSockets Pub/Sub State
CONNECTED_CLIENTS: set[Any] = set()
SYSTEM_LOCKED = False
CURRENT_SESSION_CONTEXT: list[dict[str, Any]] = []
GLOBAL_STATE = "STATE_ODIN"
AUTH_KEY = ""

def generate_or_load_key() -> None:
    """Loads or generates the WebSocket authentication key."""
    global AUTH_KEY
    if KEY_FILE.exists():
        AUTH_KEY = KEY_FILE.read_text().strip()
    else:
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        AUTH_KEY = secrets.token_hex(32)
        KEY_FILE.write_text(AUTH_KEY)

def load_engine() -> None:
    """Initializes the semantic engine and command registry."""
    global ENGINE, COMMAND_REGISTRY, RPC
    thesaurus_path = project_root / "src" / "data" / "thesaurus.qmd"
    corrections_path = project_root / ".agent" / "corrections.json"
    stopwords_path = project_root / "src" / "data" / "stopwords.json"

    RPC = SovereignRPC(project_root)

    ENGINE = SovereignVector(str(thesaurus_path), str(corrections_path), str(stopwords_path))
    ENGINE.load_core_skills()
    ENGINE.load_skills_from_dir(str(project_root / "src" / "skills" / "local"))
    ENGINE.build_index()

    # Initialize Warden
    global WARDEN
    with contextlib.suppress(Exception):
        from src.core.engine.atomic_gpt import AnomalyWarden
        WARDEN = AnomalyWarden()

    dirs = [project_root / ".agent" / "workflows", project_root / ".agent" / "skills"]
    print("[DAEMON] Building Command Registry...")
    count = 0
    for d in dirs:
        if d.exists():
            for f in list(d.glob("*.qmd")) + list(d.glob("*.md")) + list(d.glob("*.py")):
                 cmd_name = f.stem
                 if f.suffix in ['.md', '.qmd']:
                    with contextlib.suppress(Exception):
                        content = f.read_text(encoding='utf-8')
                        m = re.search(r"^name:\s*['\"]?([\w-]+)['\"]?", content, re.MULTILINE)
                        if m:
                            cmd_name = m.group(1)
                 COMMAND_REGISTRY[cmd_name] = str(f)
                 count += 1

    print(f"[DAEMON] Registry loaded with {count} commands.")

def get_memory_usage_mb() -> float:
    """Returns the current process RSS memory usage in MB."""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def check_memory_and_restart() -> None:
    """Restarts the process if memory limit is exceeded."""
    gc.collect()
    mem_usage = get_memory_usage_mb()
    if mem_usage > MEMORY_LIMIT_MB:
        print(f"[DAEMON] Memory breach ({mem_usage:.2f}MB). Restarting.")
        with contextlib.suppress(Exception):
            os.execv(sys.executable, [sys.executable, "-m", "src.cstar.core.daemon"])
        sys.exit(1)

async def broadcast_state(event_type: str, payload: dict | None = None) -> None:
    """Broadcasts a state change to all connected WebSocket clients."""
    if payload is None:
        payload = {}
    message = json.dumps({"type": "broadcast", "event": event_type, "data": payload})
    if CONNECTED_CLIENTS:
        websockets.broadcast(CONNECTED_CLIENTS, message)

async def handle_client(websocket: Any) -> None:
    """Handles an individual WebSocket client connection and command loop."""
    global SYSTEM_LOCKED, CURRENT_SESSION_CONTEXT, GLOBAL_STATE, AUTH_KEY
    try:
        # Require Authentication Handshake
        try:
            auth_msg = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            auth_data = json.loads(auth_msg)
            if auth_data.get("auth_key") != AUTH_KEY:
                await websocket.close(1008, "Invalid Auth Key")
                return
        except Exception:
            await websocket.close(1008, "Auth missing or invalid")
            return

        CONNECTED_CLIENTS.add(websocket)
        # Send SYNC_STATE upon connect
        await websocket.send(json.dumps({
            "type": "broadcast",
            "event": "SYNC_STATE",
            "data": {"state": GLOBAL_STATE, "locked": SYSTEM_LOCKED}
        }))

        async for message in websocket:
            try:
                data = json.loads(message)
                command = data.get("command")
                args = data.get("args", [])
                cwd = data.get("cwd", str(Path.cwd()))

                if command == "get_dashboard_state":
                    if RPC:
                        res = await asyncio.to_thread(RPC.get_dashboard_state)
                        await websocket.send(json.dumps({"type": "result", "data": res}))
                    continue

                if command == "telemetry":
                    global WARDEN
                    if WARDEN:
                        latency = data.get("latency", 0.0)
                        error = data.get("error", 0.0)
                        features = [float(latency), 200.0, 1.0, float(error)]
                        WARDEN.train_step(features, 0.0)
                    continue

                if command == "forge":
                    asyncio.create_task(process_forge_stream(websocket, args, cwd))
                    continue

                if SYSTEM_LOCKED:
                    msg = {"type": "broadcast", "event": "STATE_SYSTEM_LOCKED"}
                    await websocket.send(json.dumps(msg))
                    continue

                SYSTEM_LOCKED = True
                await broadcast_state("STATE_SYSTEM_LOCKED", {"locked": True})

                input_str = command
                full_query = f"{input_str} {' '.join(args)}".strip().lower()

                if GLOBAL_STATE == "STATE_ALFRED_REPORT" and \
                   full_query in ["thanks alfred", "dismiss", "resume vanguard", "continue"]:
                        CURRENT_SESSION_CONTEXT.clear()
                        GLOBAL_STATE = "STATE_ODIN"
                        await broadcast_state("STATE_ODIN")
                        SYSTEM_LOCKED = False
                        await broadcast_state("STATE_SYSTEM_LOCKED", {"locked": False})
                        res_msg = "Very good, sir. Securing the channel."
                        await websocket.send(json.dumps({
                            "type": "result", "status": "success", "message": res_msg
                        }))
                        continue

                try:
                    response = await process_command(input_str, args, cwd)

                    if response.get("type") == "uplink" or \
                       response.get("status") == "uplink_success":
                        GLOBAL_STATE = "STATE_ALFRED_REPORT"
                        CURRENT_SESSION_CONTEXT.append({"query": full_query, "response": response})
                        await broadcast_state("PAYLOAD_READY", {"persona": "ALFRED"})
                    else:
                        if GLOBAL_STATE == "STATE_ALFRED_REPORT":
                            CURRENT_SESSION_CONTEXT.clear()
                            GLOBAL_STATE = "STATE_ODIN"
                            await broadcast_state("STATE_ODIN")

                    await websocket.send(json.dumps({"type": "result", "data": response}))
                except Exception as e:
                    GLOBAL_STATE = "STATE_ALFRED_REPORT"
                    await broadcast_state("PAYLOAD_READY", {"persona": "ALFRED", "error": True})
                    err_msg = f"Diagnostics: {e!s}"
                    await websocket.send(json.dumps({"type": "result", "status": "error", "message": err_msg}))
                finally:
                    SYSTEM_LOCKED = False
                    await broadcast_state("STATE_SYSTEM_LOCKED", {"locked": False})
                    check_memory_and_restart()

            except json.JSONDecodeError:
                continue

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if websocket in CONNECTED_CLIENTS:
            CONNECTED_CLIENTS.remove(websocket)

def engine_search_sync(query: str) -> tuple[dict | None, dict | None, float]:
    """Performs semantic search via the vector engine (Thread-safe)."""
    if not ENGINE:
        return None, None, 0.0
    results = ENGINE.search(query)
    top = results[0] if results else None
    score = top['score'] if top else 0.0

    parts = query.split()
    cmd = parts[0] if parts else ""
    if cmd in COMMAND_REGISTRY:
        return {
            "status": "success", "type": "deterministic",
            "target": COMMAND_REGISTRY[cmd], "args": parts[1:]
        }, top, score

    return None, top, score

async def process_command(input_str: str, args: list[str], cwd: str) -> dict[str, Any]:
    """Processes an incoming CLI command or natural language query."""
    global COMMAND_REGISTRY, UPLINK, SESSION_TRACES, CURRENT_SESSION_CONTEXT

    if not input_str:
        return {"status": "error"}

    if input_str == "sleep":
        return await execute_sleep_protocol()

    SESSION_TRACES.append({"cmd": input_str, "args": args, "ts": time.time()})

    query = f"{input_str} {' '.join(args)}".strip()

    deterministic_resp, top, score = await asyncio.to_thread(engine_search_sync, query)
    if deterministic_resp:
        return deterministic_resp

    if score < CONFIDENCE_THRESHOLD or input_str in ["ask", "brain", "uplink", "analyze", "summarize"]:
        await broadcast_state("STATE_ALFRED_THINKING")
        context = {
            "cwd": cwd,
            "persona": "ALFRED",
            "traces": SESSION_TRACES[-5:],
            "session_context": CURRENT_SESSION_CONTEXT
        }
        uplink_response = await UPLINK.send_payload(query, context)
        return {"status": "uplink_success", "type": "uplink", "data": uplink_response}

    return {"status": "success", "type": "probabilistic",
            "target": top['trigger'] if top else "unknown", "score": score}

async def process_forge_stream(websocket: Any, args_list: list[str], cwd: str) -> None:
    """Streams the autonomous code generation (Forge) via WebSockets."""
    global SESSION_TRACES
    task = ""
    target = ""
    try:
        if "--task" in args_list:
            task = args_list[args_list.index("--task") + 1]
        if "--target" in args_list:
            target = args_list[args_list.index("--target") + 1]
    except IndexError:
        pass

    if not task or not target:
        msg = json.dumps({"type": "result", "status": "error", "message": "Missing arguments"})
        await websocket.send(msg)
        return

    forge = Forge()
    SESSION_TRACES.append({"cmd": "forge", "task": task, "target": target,
                           "ts": time.time(), "status": "started"})

    payload = IntentPayload(
        system_meta={"confidence": 1.0, "source": "daemon_direct"},
        intent_raw=task,
        intent_normalized=ENGINE.normalize(task) if ENGINE else task,
        target_workflow="FORGE_DIRECT",
        extracted_entities={}
    )

    async for event in forge.execute(payload, target):
        await websocket.send(json.dumps(event))
        if event.get("type") == "result":
             SESSION_TRACES.append({"cmd": "forge_result", "task": task,
                                    "result": event, "ts": time.time()})

async def execute_sleep_protocol() -> dict[str, Any]:
    """Consolidates session traces and releases the Raven Wardens."""
    global SESSION_TRACES
    ts = int(time.time())
    proj_mem = project_root / ".agent" / "memory" / f"session_{ts}.json"
    proj_mem.parent.mkdir(parents=True, exist_ok=True)
    proj_mem.write_text(json.dumps(SESSION_TRACES, indent=2))

    with contextlib.suppress(Exception):
        subprocess.Popen([sys.executable, "-m", "src.sentinel.muninn", "--audit"],
                         cwd=str(project_root))

    SESSION_TRACES = []
    global CURRENT_SESSION_CONTEXT
    CURRENT_SESSION_CONTEXT.clear()

    return {"status": "success", "message": "Session consolidated.", "gungnir": "PASS"}

async def async_start_daemon() -> None:
    """Asynchronous entry point for the daemon WebSocket server."""
    load_engine()
    generate_or_load_key()

    if PID_FILE.exists():
        with contextlib.suppress(Exception):
           if psutil.pid_exists(int(PID_FILE.read_text())):
               return
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()))

    print(f"[DAEMON] Started PID: {os.getpid()} PORT: {PORT}")
    print(f"[DAEMON] Auth Key generated at {KEY_FILE}")

    try:
        async with websockets.serve(handle_client, HOST, PORT):
            await asyncio.Future()  # run forever
    except OSError:
        sys.exit(1)
    finally:
        if PID_FILE.exists():
            PID_FILE.unlink()

def start_daemon() -> None:
    """Main daemon entry point."""
    asyncio.run(async_start_daemon())

if __name__ == "__main__":
    start_daemon()
