#!/usr/bin/env python3
"""Send a research task to nexplaynexus daemon via FIFO."""
import json
import select
import subprocess
import time

DAEMON_DIR = "/home/morderith/Corvus/NexplayNexus/.hermes-daemon"
FIFO = f"{DAEMON_DIR}/stdin.fifo"

msg = {
    "type": "start",
    "payload": {
        "topic": "Daily research — 2026-05-16",
        "lanes": ["pos_systems", "gamification", "esports_infrastructure"],
        "rounds": 3,
        "tools": ["web_search", "x_api", "file_read"]
    }
}

# Write to FIFO
with open(FIFO, "w") as f:
    f.write(json.dumps(msg) + "\n")
    f.flush()

print("Message sent. Waiting for report (up to 180s)...")

# Wait for response
start = time.time()
while time.time() - start < 180:
    # Check daemon process
    result = subprocess.run(["ps", "-p", "886332"], capture_output=True)
    if result.returncode != 0:
        print("Daemon process died!")
        break
    time.sleep(2)
    print(f"Still waiting... ({int(time.time()-start)}s)")

print("Done.")
