#!/usr/bin/env python3
"""
One-shot research for nexplaynexus daemon.
Starts daemon, sends research task, captures report, writes digest, stops daemon.
"""
import subprocess
import os
import sys
import json
import datetime
import threading
import select
from pathlib import Path

HOME = Path.home()
SPOKE = "nexplaynexus"
PROFILE = "nexplaynexus"
DAEMON_DIR = Path(f"/home/morderith/Corvus/{SPOKE}/.hermes-daemon")
SCRIPT = Path("/home/morderith/Corvus/CStar/scripts/hermes-daemon/spoke-daemon.sh")
LOG_DIR = HOME / ".hermes-daemon-logs" / SPOKE
COMM_LOG = LOG_DIR / "daemon-comm.log"

def log(msg):
    ts = datetime.datetime.now().isoformat()
    line = f"[{ts}] [one-shot] {msg}"
    print(line, flush=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(COMM_LOG, "a") as f:
        f.write(line + "\n")

# Clean stale state
stop_file = DAEMON_DIR / "stop"
if stop_file.exists():
    stop_file.unlink()
pipe_in = DAEMON_DIR / "stdin.fifo"
if pipe_in.exists():
    pipe_in.unlink()
os.mkfifo(pipe_in)

# Start daemon
log("Starting daemon")
proc = subprocess.Popen(
    ["bash", str(SCRIPT), SPOKE, PROFILE],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1,
)

# Read stdout in thread
out_lines = []
def read_stdout():
    for line in proc.stdout:
        out_lines.append(line)
        log(f"DAEMON: {line.rstrip()}")

t = threading.Thread(target=read_stdout, daemon=True)
t.start()

import time
time.sleep(3)

if proc.poll() is not None:
    stderr = proc.stderr.read() if proc.stderr else ""
    log(f"Daemon exited immediately. stderr={stderr}")
    sys.exit(1)

log("Daemon running. Sending research task...")

topic = "Daily research — 2026-05-16"
msg = {
    "type": "start",
    "payload": {
        "topic": topic,
        "lanes": ["pos_systems", "gamification", "esports_infrastructure"],
        "rounds": 3,
        "tools": ["web_search", "x_api", "file_read"]
    }
}
msg_str = json.dumps(msg)
log(f"SEND: {msg_str}")

# Write to FIFO
with open(str(pipe_in), "w") as f:
    f.write(msg_str + "\n")
    f.flush()

# Read response (wait up to 180s for hermes to do its work)
log("Waiting for response...")
response_line = None
deadline = time.time() + 180
while time.time() < deadline:
    # Check if process died
    if proc.poll() is not None:
        log("Daemon process died.")
        break
    # Check stdout with select
    ready, _, _ = select.select([proc.stdout], [], [], 5)
    if ready:
        line = proc.stdout.readline()
        if line:
            log(f"RECV: {line.rstrip()}")
            # Try to parse
            try:
                resp = json.loads(line.strip())
                if resp.get("type") == "report":
                    response_line = line
                    break
            except json.JSONDecodeError:
                log(f"Non-JSON line received: {line.rstrip()}")
    else:
        log("Still waiting...")

if not response_line:
    log("No valid response received.")
    # Write stop signal
    stop_file.write_text(datetime.datetime.now().isoformat())
    proc.terminate()
    proc.wait(timeout=10)
    sys.exit(1)

# Parse report
resp = json.loads(response_line.strip())
payload = resp.get("payload", {})
content = payload.get("content", "")
skills_written = payload.get("skills_written", [])
findings = payload.get("findings", [])

# Write report to wiki/queries
report_date = datetime.date.today().isoformat()
report_path = HOME / f"wiki/queries/nexplaynexus-daily-{report_date}.md"
report_path.parent.mkdir(parents=True, exist_ok=True)

with open(report_path, "w") as f:
    f.write(f"# NexplayNexus Research Report — {report_date}\n\n")
    f.write(f"**Topic:** {topic}\n\n")
    f.write(f"**Lanes:** pos_systems, gamification, esports_infrastructure\n\n")
    f.write(f"**Skills Written:** {', '.join(skills_written) if skills_written else 'None'}\n\n")
    f.write(f"**Findings:**\n")
    for finding in findings:
        f.write(f"- {finding}\n")
    f.write("\n---\n\n")
    f.write(content)

log(f"Report written to {report_path}")

# Send stop
stop_msg = {"type": "stop"}
with open(str(pipe_in), "w") as f:
    f.write(json.dumps(stop_msg) + "\n")
    f.flush()

stop_file.write_text(datetime.datetime.now().isoformat())
proc.terminate()
try:
    proc.wait(timeout=10)
except subprocess.TimeoutExpired:
    proc.kill()
log("Daemon stopped.")

print(f"\n=== REPORT WRITTEN ===")
print(f"Path: {report_path}")
print(f"Skills: {skills_written}")
print(f"Findings: {findings}")
