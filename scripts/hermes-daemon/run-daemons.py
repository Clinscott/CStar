#!/usr/bin/env python3
"""
run-daemons.py — Corvus-side orchestrator for spoke Hermes daemons.
Spawns per-spoke daemon processes, manages stdin/stdout communication,
logs all traffic, and aggregates reports.

Usage:
  python3 run-daemons.py start [--spokes moonshot,corvuseye]  # start all or subset
  python3 run-daemons.py stop [--spokes moonshot]             # stop all or subset
  python3 run-daemons.py status                              # show daemon health
  python3 run-daemons.py send --spoke moonshot --topic "..."  # one-shot send

Each daemon is a bash subprocess running spoke-daemon.sh.
Communication: write JSON to daemon's stdin FIFO, read JSON from stdout.

Flow per scheduled run:
  1. Corvus orchestrator reads daily digest objective per spoke
  2. Spawn daemon (if not already running)
  3. Send {type:"start", payload:{topic, lanes, rounds, tools}}
  4. Read {type:"report", payload:{content, skills_written, findings}}
  5. Write report to spoke's .hermes-daemon/reports/<date>.md
  6. Corvus reads report and integrates into main Hall
  7. Send {type:"stop"} or let rounds exhaust
  8. Daemon exits; next spoke fires

All daemon communication logs go to:
  ~/.hermes-daemon-logs/<spoke>/daemon-comm.log
"""

import subprocess
import os
import sys
import json
import datetime
import signal
import threading
import queue
from pathlib import Path
from typing import Optional

HOME = Path.home()
SPOKES = ["moonshot", "fallowshallowrpg", "corvuseye", "nexplaynexus", "securesphere", "taliesin", "xo"]

class SpokeDaemon:
    """Manages one spoke daemon process and its communication pipe."""

    def __init__(self, spoke: str, profile: str):
        self.spoke = spoke
        self.profile = profile
        self.process: Optional[subprocess.Popen] = None
        self.log_dir = HOME / ".hermes-daemon-logs" / spoke
        self.daemon_dir = Path(f"/home/morderith/Corvus/{spoke}/.hermes-daemon")
        self.comm_log = self.log_dir / "daemon-comm.log"
        self.report_dir = HOME / "wiki/queries"  # Corvus reads from here

    def _log(self, msg: str):
        ts = datetime.datetime.now().isoformat()
        line = f"[{ts}] [{self.spoke}] {msg}"
        print(line, flush=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        with open(self.comm_log, "a") as f:
            f.write(line + "\n")

    def start(self):
        """Spawn the daemon subprocess."""
        script = Path("/home/morderith/Corvus/CStar/scripts/hermes-daemon/spoke-daemon.sh")
        self.daemon_dir.mkdir(parents=True, exist_ok=True)

        # Clear stale stop file and FIFO before starting
        stop_file = self.daemon_dir / "stop"
        if stop_file.exists():
            stop_file.unlink()
        pipe_in = self.daemon_dir / "stdin.fifo"
        if pipe_in.exists():
            pipe_in.unlink()
        os.mkfifo(pipe_in)

        self._log(f"Starting daemon — script={script} profile={self.profile}")

        # Start daemon process
        self.process = subprocess.Popen(
            ["bash", str(script), self.spoke, self.profile],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # line buffered
        )

        # Read startup output (daemon logs to stdout)
        def read_stdout():
            for line in self.process.stdout:
                self._log(f"DAEMON: {line.rstrip()}")

        t = threading.Thread(target=read_stdout, daemon=True)
        t.start()

        # Wait for daemon to be ready (read first line from stderr or wait 3s)
        import time
        time.sleep(2)

        if self.process.poll() is not None:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            self._log(f"Daemon exited immediately. stderr={stderr}")
            return False

        self._log("Daemon started successfully.")
        return True

    def send(self, payload: dict) -> Optional[dict]:
        """Send JSON to daemon, read response."""
        if self.process is None or self.process.poll() is not None:
            self._log("Daemon not running.")
            return None

        msg = json.dumps(payload)
        self._log(f"SEND: {msg}")

        try:
            # Write to stdin pipe (daemon reads from FIFO)
            pipe_in = self.daemon_dir / "stdin.fifo"
            with open(str(pipe_in), "w") as f:
                f.write(msg + "\n")
                f.flush()

            # Read response from stdout (non-blocking with timeout)
            import select
            ready, _, _ = select.select([self.process.stdout], [], [], 120)
            if ready:
                response_line = self.process.stdout.readline()
                if response_line:
                    response = json.loads(response_line.strip())
                    self._log(f"RECV: {response}")
                    return response
        except Exception as e:
            self._log(f"send error: {e}")

        return None

    def stop(self):
        """Signal daemon to stop."""
        self._log("Stopping daemon...")
        stop_file = self.daemon_dir / "stop"
        stop_file.write_text(datetime.datetime.now().isoformat())
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self._log("Daemon stopped.")

    def is_running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def write_report(self, content: str, topic: str):
        """Write the daemon's research report to the reports directory."""
        date = datetime.date.today().isoformat()
        report_path = self.report_dir / f"{self.spoke}-daemon-{date}.md"
        with open(report_path, "w") as f:
            f.write(f"# {self.spoke.title()} Research Report — {date}\n\n")
            f.write(f"**Topic:** {topic}\n\n")
            f.write(content)
        self._log(f"Report written to {report_path}")
        return report_path


class DaemonOrchestrator:
    """Manages all spoke daemons and coordinates research runs."""

    def __init__(self):
        self.daemons: dict[str, SpokeDaemon] = {}
        self.log_base = HOME / ".hermes-daemon-logs"
        self.log_base.mkdir(parents=True, exist_ok=True)

    def start_all(self, spokes: list[str] = SPOKES):
        """Start daemons for all (or a subset) of spokes."""
        print(f"[Orchestrator] Starting {len(spokes)} daemons...")
        for spoke in spokes:
            daemon = SpokeDaemon(spoke, spoke)  # profile = spoke for 1:1
            if daemon.start():
                self.daemons[spoke] = daemon
            else:
                print(f"[Orchestrator] Failed to start {spoke}")
        print(f"[Orchestrator] {len(self.daemons)}/{len(spokes)} daemons running.")

    def stop_all(self, spokes: list[str] = None):
        """Stop daemons. If spokes=None, stop all."""
        targets = spokes if spokes else list(self.daemons.keys())
        for spoke in targets:
            if spoke in self.daemons:
                self.daemons[spoke].stop()
                del self.daemons[spoke]

    def status(self):
        """Print status of all daemons."""
        print("\n=== Daemon Status ===")
        for spoke in SPOKES:
            if spoke in self.daemons:
                d = self.daemons[spoke]
                status = "RUNNING" if d.is_running() else "DEAD"
                log = d.comm_log
                last = "N/A"
                if log.exists():
                    lines = log.read_text().strip().split("\n")
                    last = lines[-1][:80] if lines else "N/A"
                print(f"  {spoke}: {status}  last={last}")
            else:
                print(f"  {spoke}: NOT STARTED")

    def run_research(self, spoke: str, topic: str, lanes: list[str], rounds: int = 3) -> Optional[dict]:
        """Run one research cycle for a spoke daemon."""
        if spoke not in self.daemons:
            print(f"[Orchestrator] {spoke} daemon not running. Starting it...")
            daemon = SpokeDaemon(spoke, spoke)
            if not daemon.start():
                return None
            self.daemons[spoke] = daemon

        daemon = self.daemons[spoke]

        # Send start message
        start_msg = {
            "type": "start",
            "payload": {
                "topic": topic,
                "lanes": lanes,
                "rounds": rounds,
                "tools": ["web_search", "x_api", "file_read"]
            }
        }

        response = daemon.send(start_msg)
        if not response:
            print(f"[Orchestrator] No response from {spoke}")
            return None

        if response.get("type") == "report":
            payload = response.get("payload", {})
            content = payload.get("content", "")
            skills_written = payload.get("skills_written", [])
            findings = payload.get("findings", [])

            # Write report
            report_path = daemon.write_report(content, topic)

            # Send stop
            daemon.send({"type": "stop"})

            return {
                "spoke": spoke,
                "report_path": str(report_path),
                "skills_written": skills_written,
                "findings": findings,
                "content": content[:500]  # preview
            }

        return response

    def run_all_research(self):
        """Run research for all active daemons sequentially."""
        results = []
        for spoke in SPOKES:
            if spoke not in self.daemons:
                continue
            print(f"\n[Orchestrator] Running research for {spoke}...")
            result = self.run_research(
                spoke,
                topic=f"Daily research — {datetime.date.today().isoformat()}",
                lanes=self._get_lanes(spoke),
                rounds=3
            )
            results.append((spoke, result))
            print(f"[Orchestrator] {spoke} result: {result}")

        return results

    def _get_lanes(self, spoke: str) -> list[str]:
        """Return the research lanes for a spoke."""
        lanes_map = {
            "moonshot": ["flight_hardware", "local_model", "jpl_hpsc"],
            "fallowshallowrpg": ["rpg_mechanics", "game_ai_npcs", "engine_updates"],
            "corvuseye": ["computer_vision", "ai_inference", "edge_ai"],
            "nexplaynexus": ["pos_systems", "gamification", "esports_infrastructure"],
            "securesphere": ["cybersecurity", "authentication", "zero_trust"],
            "taliesin": ["narrative_ai", "nlg_systems", "publishing_pipeline"],
            "xo": ["general_development", "industry_news"],
        }
        return lanes_map.get(spoke, ["general"])


# ── CLI ─────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Hermes Spoke Daemon Orchestrator")
    parser.add_argument("action", choices=["start", "stop", "status", "run", "send"])
    parser.add_argument("--spoke", default="")
    parser.add_argument("--topic", default="")
    parser.add_argument("--spokes", default="")

    args = parser.parse_args()

    if args.action == "status":
        DaemonOrchestrator().status()
    elif args.action == "start":
        spokes = SPOKES if args.spokes == "all" else args.spokes.split(",")
        DaemonOrchestrator().start_all(spokes)
    elif args.action == "stop":
        spokes = None if args.spokes == "all" else args.spokes.split(",")
        DaemonOrchestrator().stop_all(spokes)
    elif args.action == "run":
        o = DaemonOrchestrator()
        o.start_all(SPOKES)
        results = o.run_all_research()
        o.stop_all()
        print("\n=== Results ===")
        for spoke, result in results:
            print(f"{spoke}: {result}")
    elif args.action == "send":
        o = DaemonOrchestrator()
        if not args.spoke:
            print("--spoke required")
            sys.exit(1)
        o.start_all([args.spoke])
        result = o.run_research(args.spoke, args.topic or "ad-hoc research", ["general"], rounds=2)
        o.stop_all([args.spoke])
        print(result)


if __name__ == "__main__":
    main()