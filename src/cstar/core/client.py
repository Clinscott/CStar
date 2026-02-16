import socket
import json
import sys
import os
import argparse
import time
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

HOST = 'localhost'
PORT = 50051

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
    
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((HOST, PORT))
            s.sendall(json.dumps(payload).encode('utf-8'))
            
            # [PLAN B] Streaming Response Handling
            # Verify if command is forge (or other streaming commands)
            # Actually, simply reading until close allows supporting both Sync and Async if structured right.
            # However, for simplicity, we read line by line or chunk by chunk.
            
            # Use a file-like object for cleaner line reading
            f = s.makefile('rb') 
            
            last_result = None
            
            for line in f:
                if not line: break
                try:
                    event = json.loads(line.decode('utf-8'))
                    
                    if event.get("type") == "ui":
                        # Render UI Event
                        persona = event.get("persona", "SYSTEM")
                        msg = event.get("msg", "")
                        # Simple Color/Prefix Logic
                        prefix = f"[{persona}]"
                        print(f"{prefix} {msg}")
                    
                    elif event.get("type") == "result":
                        last_result = event
                    
                    # If it's a standard response (no type), treat as result
                    elif "status" in event and "type" not in event:
                         last_result = event

                except json.JSONDecodeError:
                    pass
            
            return last_result if last_result else {"status": "success", "message": "Stream ended without result."}
            
    except ConnectionRefusedError:
        return {"status": "error", "message": "Daemon not running."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: c* <command> [args...]")
        sys.exit(1)
        
    cmd = sys.argv[1]
    cmd_args = sys.argv[2:]
    
    # [PLAN B] Everything goes through Daemon
    result = send_command(cmd, cmd_args)
    
    # Only print result if not already handled by UI stream or if it's a simple command
    # If result has 'type': 'result', we might want to suppress it if UI was shown, or show summary?
    # For standard commands, we print JSON. For forge, UI handles it.
    
    if result and cmd != "forge":
         print(json.dumps(result, indent=2))
    elif result and result.get("status") == "error":
         print(json.dumps(result, indent=2))
