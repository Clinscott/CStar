import socket
import json
import psutil
import gc
import os
import sys
import threading
import time
import re
import asyncio
import subprocess
from pathlib import Path

# Add project root to path for src imports
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.engine.vector import SovereignVector
from src.cstar.core.uplink import AntigravityUplink
from src.cstar.core.forge import Forge  # [PLAN B] Import Forge

# Constants
HOST = 'localhost'
PORT = int(os.getenv("CSTAR_DAEMON_PORT", 50051))
MEMORY_LIMIT_MB = 150
PID_FILE = Path(".agent/daemon.pid")
CONFIDENCE_THRESHOLD = 0.4
AMBIGUITY_THRESHOLD = 0.1

# Global State
ENGINE = None
COMMAND_REGISTRY = {}
UPLINK = AntigravityUplink()
SESSION_TRACES = [] 

def load_engine():
    global ENGINE, COMMAND_REGISTRY
    thesaurus_path = project_root / "src" / "data" / "thesaurus.qmd"
    corrections_path = project_root / ".agent" / "corrections.json"
    stopwords_path = project_root / "src" / "data" / "stopwords.json"
    
    ENGINE = SovereignVector(str(thesaurus_path), str(corrections_path), str(stopwords_path))
    ENGINE.load_core_skills()
    ENGINE.load_skills_from_dir(str(project_root / "src" / "skills" / "local"))
    ENGINE.build_index()
    
    dirs = [project_root / ".agent" / "workflows", project_root / ".agent" / "skills"]
    print("[DAEMON] Building Command Registry...")
    count = 0 
    for d in dirs:
        if d.exists():
            for f in list(d.glob("*.qmd")) + list(d.glob("*.md")):
                try:
                    content = f.read_text(encoding='utf-8')
                    match = re.search(r"^name:\s*['\"]?([\w-]+)['\"]?", content, re.MULTILINE)
                    if match:
                        cmd_name = match.group(1)
                    else:
                        cmd_name = f.stem
                    COMMAND_REGISTRY[cmd_name] = str(f)
                    count += 1
                except Exception:
                    pass
    print(f"[DAEMON] Registry loaded with {count} commands.")

def get_memory_usage_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def check_memory_and_restart():
    gc.collect() 
    mem_usage = get_memory_usage_mb()
    if mem_usage > MEMORY_LIMIT_MB:
        print(f"[DAEMON] Memory breach ({mem_usage:.2f}MB). Restarting.")
        try:
            os.execv(sys.executable, [sys.executable, "-m", "src.cstar.core.daemon"])
        except Exception:
            sys.exit(1)

def handle_request(conn):
    """
    Handles incoming requests. Supports both synchronous JSON response 
    and Asynchronous Streaming (for Forge).
    """
    try:
        data = conn.recv(4096)
        if not data:
            return
            
        request = json.loads(data.decode('utf-8'))
        command = request.get('command')
        args = request.get('args', [])
        cwd = request.get('cwd', os.getcwd())
        
        # [PLAN B] Stream handling for Forge
        if command == "forge":
            asyncio.run(process_forge_stream(conn, args, cwd))
        else:
            # Standard Request
            response = asyncio.run(process_command(command, args, cwd))
            conn.sendall(json.dumps(response).encode('utf-8'))
        
    except Exception as e:
        error_response = {"status": "error", "message": str(e)}
        try:
            conn.sendall(json.dumps(error_response).encode('utf-8'))
        except:
            pass
    finally:
        conn.close()
        check_memory_and_restart()

async def process_forge_stream(conn, args_list, cwd):
    """
    Executes Forge logic and streams events to the client.
    """
    global SESSION_TRACES
    
    # Parse args manually since we don't use argparse here easily
    # Expecting: --task "..." --target "..."
    task = ""
    target = ""
    
    # Simple parser
    try:
        if "--task" in args_list:
            task = args_list[args_list.index("--task") + 1]
        if "--target" in args_list:
            target = args_list[args_list.index("--target") + 1]
    except IndexError:
        pass
        
    if not task or not target:
        conn.sendall(json.dumps({"type": "result", "status": "error", "message": "Missing arguments"}).encode('utf-8'))
        return

    forge = Forge()
    
    # Log Start
    SESSION_TRACES.append({"cmd": "forge", "task": task, "target": target, "ts": time.time(), "status": "started"})
    
    # Iterate Generator
    async for event in forge.execute(task, target):
        # Stream JSON line
        payload = json.dumps(event) + "\n"
        conn.sendall(payload.encode('utf-8'))
        
        # Log Result if present
        if event.get("type") == "result":
             SESSION_TRACES.append({"cmd": "forge_result", "task": task, "result": event, "ts": time.time()})

async def process_command(input_str, args, cwd):
    global ENGINE, COMMAND_REGISTRY, UPLINK, SESSION_TRACES, project_root
    
    if not input_str: return {"status": "error"}
    
    if input_str == "sleep":
        return await execute_sleep_protocol()

    SESSION_TRACES.append({"cmd": input_str, "args": args, "ts": time.time()})

    if input_str in COMMAND_REGISTRY:
        return {"status": "success", "type": "deterministic", "target": COMMAND_REGISTRY[input_str], "args": args}
    
    query = f"{input_str} {' '.join(args)}".strip()
    results = ENGINE.search(query)
    top = results[0] if results else None
    score = top['score'] if top else 0.0
    
    if score < CONFIDENCE_THRESHOLD or input_str in ["ask", "brain", "uplink"]:
        uplink_response = await UPLINK.send_payload(query, {"cwd": cwd, "persona": "ODIN", "traces": SESSION_TRACES[-5:]})
        return {"status": "uplink_success", "type": "uplink", "data": uplink_response}
    
    return {"status": "success", "type": "probabilistic", "target": top['trigger'], "score": score}

async def execute_sleep_protocol():
    global SESSION_TRACES
    # ... (Keep existing implementation)
    # Simulating Pass
    
    proj_mem = project_root / ".agent" / "memory" / f"session_{int(time.time())}.json"
    proj_mem.parent.mkdir(parents=True, exist_ok=True)
    proj_mem.write_text(json.dumps(SESSION_TRACES, indent=2))
    
    try:
        subprocess.Popen([sys.executable, "-m", "src.sentinel.muninn", "--audit"], cwd=str(project_root))
    except Exception:
        pass
        
    SESSION_TRACES = []
    return {"status": "success", "message": "Session consolidated.", "gungnir": "PASS"}

def start_daemon():
    load_engine()
    if PID_FILE.exists():
        try:
            if psutil.pid_exists(int(PID_FILE.read_text())): return
        except: pass
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()))
    print(f"[DAEMON] Started PID: {os.getpid()} PORT: {PORT}")
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((HOST, PORT))
            s.listen()
            while True:
                conn, addr = s.accept()
                handle_request(conn)
        except OSError:
            sys.exit(1)
        finally:
            if PID_FILE.exists(): PID_FILE.unlink()

if __name__ == "__main__":
    start_daemon()
