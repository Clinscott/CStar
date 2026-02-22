import json
import sys
import os
import argparse
import time
from pathlib import Path
from websockets.sync.client import connect
import websockets

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

HOST = '127.0.0.1'
PORT = int(os.getenv("CSTAR_DAEMON_PORT", 50051))
KEY_FILE = project_root / ".agent" / "daemon.key"

def ping_daemon(host=HOST, port=PORT, timeout=1.0):
    """
    Pre-flight check to verify the Cortex Daemon is online via websockets.
    Raises ConnectionError or TimeoutError if the daemon is unreachable.
    """
    uri = f"ws://{host}:{port}"
    try:
        # Just testing connection
        with connect(uri, open_timeout=timeout) as ws:
            pass
    except (websockets.exceptions.WebSocketException, ConnectionRefusedError):
        raise ConnectionRefusedError("Connection refused")

def send_command(command, args=None, cwd=None):
    if args is None:
        args = []
    if cwd is None:
        cwd = os.getcwd()
        
    payload = {
        "command": command,
        "args": args,
        "cwd": cwd
    }
    
    uri = f"ws://{HOST}:{PORT}"
    try:
        auth_key = KEY_FILE.read_text().strip() if KEY_FILE.exists() else ""
        with connect(uri, open_timeout=2.0) as ws:
            # Send Auth
            ws.send(json.dumps({"type": "auth", "auth_key": auth_key}))
            
            # Send Command
            ws.send(json.dumps(payload))
            
            last_result = None
            for msg in ws:
                try:
                    event = json.loads(msg)
                    if event.get("type") == "ui":
                        persona = event.get("persona", "SYSTEM")
                        ui_msg = event.get("msg", "")
                        print(f"[{persona}] {ui_msg}")
                        
                    elif event.get("type") == "result":
                        last_result = event.get("data") if "data" in event else event
                        if command != "forge":
                           break # simple sync commands break after first result
                    
                    elif "status" in event and "type" not in event:
                         last_result = event
                         break
                         
                    elif event.get("type") == "broadcast" and command != "forge":
                         continue
                except json.JSONDecodeError:
                    pass
            
            return last_result if last_result else {"status": "success", "message": "Stream ended without result."}
            
    except ConnectionRefusedError:
        return {"status": "error", "message": "Daemon not running."}
    except OSError:
        return {"status": "error", "message": "Daemon connection failed."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: c* <command> [args...]")
        sys.exit(1)
        
    cmd = sys.argv[1]
    cmd_args = sys.argv[2:]
    
    result = send_command(cmd, cmd_args)
    
    if result and cmd != "forge":
         print(json.dumps(result, indent=2))
    elif result and result.get("status") == "error":
         print(json.dumps(result, indent=2))
