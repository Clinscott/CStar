"""
Ravens Harness: Live Autonomous Flight Engine
Identity: ODIN
Purpose: Run the real Muninn repair cycle against the codebase using the
headless Gemini CLI (Antigravity Bridge). This is the definitive test
for Muninn's production flight capabilities.

Usage:
    python tests/ravens_harness.py --iterations 5
"""

import argparse
import json
import os
import sys
import time
import subprocess
import signal
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink
from src.core.engine.ravens.muninn_heart import MuninnHeart
from src.core.annex import HeimdallWarden
from src.core.engine.wardens.edda import EddaWarden
from src.core.engine.wardens.mimir import MimirWarden
from src.core.engine.wardens.runecaster import RuneCasterWarden
from src.core.engine.wardens.valkyrie import ValkyrieWarden
from src.core.engine.wardens.norn import NornWarden
from src.core.engine.wardens.freya import FreyaWarden
from src.core.engine.wardens.huginn import HuginnWarden
from src.core.engine.wardens.taste import TasteWarden
from src.core.engine.wardens.shadow_forge import ShadowForgeWarden

RESULTS_FILE = PROJECT_ROOT / "tests" / "ravens_harness_results.json"

class RavensHarness:
    """Orchestrates real Muninn flight cycles against live targets."""

    def __init__(self, iterations: int) -> None:
        self.iterations = iterations
        self.results = []
        self.bridge_proc = None
        self.pennyone_proc = None
        self.uplink = AntigravityUplink()
        self.heart = MuninnHeart(PROJECT_ROOT, self.uplink)
        
        # Bypass silence protocol for testing
        os.environ["MUNINN_FORCE_FLIGHT"] = "true"

    def start_bridge(self):
        """Spawns the Antigravity Bridge in the background."""
        print("[HARNESS] Awakening the Antigravity Bridge...")
        bridge_path = PROJECT_ROOT / "src" / "cstar" / "core" / "antigravity_bridge.py"
        
        # Ensure Gemini CLI knows about PennyOne
        env = os.environ.copy()
        env["GEMINI_CLI_ACTIVE"] = "true"

        self.bridge_proc = subprocess.Popen(
            [sys.executable, str(bridge_path)],
            stdout=subprocess.DEVNULL,
            stderr=sys.stderr, # Allow bridge errors to print to console
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        )
        # Wait for socket to bind
        time.sleep(2)
        print("[HARNESS] Bridge is ACTIVE.")

    def start_pennyone(self):
        """Spawns the PennyOne MCP server in the background."""
        print("[HARNESS] Awakening PennyOne (MCP)...")
        # PennyOne is a Node/TS process
        self.pennyone_proc = subprocess.Popen(
            ["npx", "tsx", "src/tools/pennyone/mcp-server.ts"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(PROJECT_ROOT),
            shell=True if os.name == 'nt' else False,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        )
        time.sleep(2)
        print("[HARNESS] PennyOne is ONLINE.")

    def stop_all(self):
        """Terminates background processes."""
        for name, proc in [("Bridge", self.bridge_proc), ("PennyOne", self.pennyone_proc)]:
            if proc:
                print(f"[HARNESS] Silencing the {name}...")
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], 
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        self.bridge_proc = None
        self.pennyone_proc = None

    def run(self):
        """Execute the harness."""
        print(f"\n{'='*60}")
        print(f"  RAVENS HARNESS — {self.iterations} iterations (LIVE FLIGHT)")
        print(f"  Target: {PROJECT_ROOT}")
        print(f"{'='*60}\n")

        self.start_pennyone()
        self.start_bridge()

        try:
            for i in range(self.iterations):
                print(f"\n--- Mission {i+1}/{self.iterations} ---")
                
                start_ts = time.time()
                # execute_cycle handles Hunt -> Forge -> Crucible -> Verify
                import asyncio
                success = asyncio.run(self.heart.execute_cycle())
                duration = time.time() - start_ts

                result = {
                    "iteration": i + 1,
                    "passed": success,
                    "duration": duration,
                    "timestamp": time.strftime("%H:%M:%S")
                }
                self.results.append(result)

                status = "✅ MISSION ACCOMPLISHED" if success else "❌ MISSION ABORTED/FAILED"
                print(f"\n[HARNESS] Result: {status} ({duration:.1f}s)")

        finally:
            self.stop_all()
            self._save_results()
            self._print_summary()

    def _save_results(self):
        """Save results to JSON."""
        summary = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total_iterations": len(self.results),
            "passed": sum(1 for r in self.results if r["passed"]),
            "failed": sum(1 for r in self.results if not r["passed"]),
            "results": self.results,
        }
        
        RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print(f"\n[HARNESS] Results saved to {RESULTS_FILE}")

    def _print_summary(self):
        """Print a human-readable summary."""
        total = len(self.results)
        if total == 0: return
        
        passed = sum(1 for r in self.results if r["passed"])
        avg_dur = sum(r["duration"] for r in self.results) / total

        print(f"\n{'='*60}")
        print("  RAVENS FLIGHT REPORT")
        print(f"{'='*60}")
        print(f"  Total Missions:  {total}")
        print(f"  Successful:      {passed} ({100*passed//total}%)")
        print(f"  Failed/Aborted:  {total - passed}")
        print(f"  Avg Duration:    {avg_dur:.1f}s")
        print(f"{'='*60}\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ravens Harness - Live Muninn testing")
    parser.add_argument("--iterations", type=int, default=1, help="Number of missions")
    args = parser.parse_args()

    harness = RavensHarness(iterations=args.iterations)
    harness.run()
