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

import psutil
import websockets

# Add project root to path for src imports
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

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
ENGINE = None
COMMAND_REGISTRY = {}
UPLINK = AntigravityUplink(api_key=os.getenv("GOOGLE_API_DAEMON_KEY") or os.getenv("GOOGLE_API_KEY"))
RPC = None
WARDEN = None
SESSION_TRACES = []

# WebSockets Pub/Sub State
CONNECTED_CLIENTS = set()
SYSTEM_LOCKED = False
CURRENT_SESSION_CONTEXT = []
GLOBAL_STATE = "STATE_ODIN"
AUTH_KEY = ""

def generate_or_load_key() -> None:
    global AUTH_KEY
    if KEY_FILE.exists():
        AUTH_KEY = KEY_FILE.read_text().strip()
    else:
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        AUTH_KEY = secrets.token_hex(32)
        KEY_FILE.write_text(AUTH_KEY)

def load_engine() -> None:
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
    try:
        from src.core.engine.atomic_gpt import AnomalyWarden
        WARDEN = AnomalyWarden()
    except Exception:
        pass

    dirs = [project_root / ".agent" / "workflows", project_root / ".agent" / "skills"]
    print("[DAEMON] Building Command Registry...")
    count = 0
    for d in dirs:
        if d.exists():
            for f in list(d.glob("*.qmd")) + list(d.glob("*.md")) + list(d.glob("*.py")):
                 cmd_name = f.stem
                 if f.suffix in ['.md', '.qmd']:
                    try:
                        content = f.read_text(encoding='utf-8')
                        match = re.search(r"^name:\s*['\"]?([\w-]+)['\"]?", content, re.MULTILINE)
                        if match: cmd_name = match.group(1)
                    except: pass
                 COMMAND_REGISTRY[cmd_name] = str(f)
                 count += 1

    print(f"[DAEMON] Registry loaded with {count} commands.")

def get_memory_usage_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def check_memory_and_restart() -> None:
    gc.collect()
    mem_usage = get_memory_usage_mb()
    if mem_usage > MEMORY_LIMIT_MB:
        print(f"[DAEMON] Memory breach ({mem_usage:.2f}MB). Restarting.")
        try:
            os.execv(sys.executable, [sys.executable, "-m", "src.cstar.core.daemon"])
        except Exception:
            sys.exit(1)

async def broadcast_state(event_type: str, payload: dict | None = None) -> None:
    if payload is None: payload = {}
    message = json.dumps({"type": "broadcast", "event": event_type, "data": payload})
    if CONNECTED_CLIENTS:
        websockets.broadcast(CONNECTED_CLIENTS, message)

async def handle_client(websocket) -> None:
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
                cwd = data.get("cwd", os.getcwd())

                if command == "get_dashboard_state":
                    # Run RPC synchronously in background thread to avoid event loop blocking
                    response = await asyncio.to_thread(RPC.get_dashboard_state)
                    await websocket.send(json.dumps({"type": "result", "data": response}))
                    continue

                if command == "telemetry":
                    # [CANARY] TUI sensory hook
                    global WARDEN
                    if WARDEN:
                        latency = data.get("latency", 0.0)
                        error = data.get("error", 0.0)
                        features = [float(latency), 200.0, 1.0, float(error)]
                        WARDEN.train_step(features, 0.0) # Self-supervised as 'healthy' unless TUI reports error
                    continue

                if command == "forge":
                    # Background task to stream forge
                    asyncio.create_task(process_forge_stream(websocket, args, cwd))
                    continue

                if SYSTEM_LOCKED:
                    await websocket.send(json.dumps({"type": "broadcast", "event": "STATE_SYSTEM_LOCKED"}))
                    continue

                SYSTEM_LOCKED = True
                await broadcast_state("STATE_SYSTEM_LOCKED", {"locked": True})

                # Check dismissal logic when ALFRED is active
                input_str = command
                full_query = f"{input_str} {' '.join(args)}".strip().lower()

                if GLOBAL_STATE == "STATE_ALFRED_REPORT":
                    if full_query in ["thanks alfred", "dismiss", "resume vanguard", "continue"]:
                        CURRENT_SESSION_CONTEXT.clear()
                        GLOBAL_STATE = "STATE_ODIN"
                        await broadcast_state("STATE_ODIN")
                        SYSTEM_LOCKED = False
                        await broadcast_state("STATE_SYSTEM_LOCKED", {"locked": False})
                        await websocket.send(json.dumps({"type": "result", "status": "success", "message": "Very good, sir. Securing the channel."}))
                        continue

                try:
                    # Process generic commands
                    response = await process_command(input_str, args, cwd)

                    if response.get("type") == "uplink" or response.get("status") == "uplink_success":
                        # Cognitive Task -> ALFRED
                        GLOBAL_STATE = "STATE_ALFRED_REPORT"
                        CURRENT_SESSION_CONTEXT.append({"query": full_query, "response": response})
                        await broadcast_state("PAYLOAD_READY", {"persona": "ALFRED"})
                    else:
                        # Vanguard Task -> ODIN
                        if GLOBAL_STATE == "STATE_ALFRED_REPORT":
                            CURRENT_SESSION_CONTEXT.clear()
                            GLOBAL_STATE = "STATE_ODIN"
                            await broadcast_state("STATE_ODIN")

                    await websocket.send(json.dumps({"type": "result", "data": response}))
                except Exception as e:
                    # Graceful degraded routing to ALFRED
                    GLOBAL_STATE = "STATE_ALFRED_REPORT"
                    await broadcast_state("PAYLOAD_READY", {"persona": "ALFRED", "error": True})
                    await websocket.send(json.dumps({"type": "result", "status": "error", "message": f"Diagnostics: {e!s}"}))
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

def engine_search_sync(query):
    # Synchronous vector search offloaded to thread
    results = ENGINE.search(query)
    top = results[0] if results else None
    score = top['score'] if top else 0.0

    # Vanguard routing if it's deterministic
    parts = query.split()
    cmd = parts[0] if parts else ""
    if cmd in COMMAND_REGISTRY:
        return {"status": "success", "type": "deterministic", "target": COMMAND_REGISTRY[cmd], "args": parts[1:]}, top, score

    return None, top, score

async def process_command(input_str, args, cwd):
    global COMMAND_REGISTRY, UPLINK, SESSION_TRACES, CURRENT_SESSION_CONTEXT

    if not input_str: return {"status": "error"}

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
        # Await natively without threading, uplink maintains its own async bounds
        uplink_response = await UPLINK.send_payload(query, context)
        return {"status": "uplink_success", "type": "uplink", "data": uplink_response}

    return {"status": "success", "type": "probabilistic", "target": top['trigger'], "score": score}

async def process_forge_stream(websocket, args_list, cwd) -> None:
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
        await websocket.send(json.dumps({"type": "result", "status": "error", "message": "Missing arguments"}))
        return

    forge = Forge()
    SESSION_TRACES.append({"cmd": "forge", "task": task, "target": target, "ts": time.time(), "status": "started"})

    # [ODIN] Wrap task in IntentPayload for structural rigidity
    payload = IntentPayload(
        system_meta={"confidence": 1.0, "source": "daemon_direct"},
        intent_raw=task,
        intent_normalized=ENGINE.normalize(task) if ENGINE else task,
        target_workflow="FORGE_DIRECT",
        extracted_entities={}
    )

    async for event in forge.execute(payload, target):
        payload_event = json.dumps(event)
        await websocket.send(payload_event)

        if event.get("type") == "result":
             SESSION_TRACES.append({"cmd": "forge_result", "task": task, "result": event, "ts": time.time()})

async def execute_sleep_protocol():
    global SESSION_TRACES
    proj_mem = project_root / ".agent" / "memory" / f"session_{int(time.time())}.json"
    proj_mem.parent.mkdir(parents=True, exist_ok=True)
    proj_mem.write_text(json.dumps(SESSION_TRACES, indent=2))

    with contextlib.suppress(Exception):
        subprocess.Popen([sys.executable, "-m", "src.sentinel.muninn", "--audit"], cwd=str(project_root))

    SESSION_TRACES = []
    # Clear session context on sleep
    global CURRENT_SESSION_CONTEXT
    CURRENT_SESSION_CONTEXT.clear()

    return {"status": "success", "message": "Session consolidated.", "gungnir": "PASS"}

async def async_start_daemon() -> None:
    load_engine()
    generate_or_load_key()

    if PID_FILE.exists():
        try:
           if psutil.pid_exists(int(PID_FILE.read_text())): return
        except: pass
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
        if PID_FILE.exists(): PID_FILE.unlink()

def start_daemon() -> None:
    asyncio.run(async_start_daemon())

if __name__ == "__main__":
    start_daemon()
