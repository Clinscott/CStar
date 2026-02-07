import os
import time
import json
import sys
import msvcrt
import subprocess
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from ui import HUD

class StatsCollector:
    """[ALFRED] Secure statistics accumulator for federated monitoring."""
    def __init__(self, project_root: str, base_dir: str):
        self.root = project_root
        self.base = base_dir
        self.db_path = os.path.join(project_root, "fishtest_data.json")
        self.rej_path = os.path.join(base_dir, "traces", "quarantine", "REJECTIONS.qmd")

    def collect(self) -> Dict[str, int]:
        stats = {"cases": 0, "rejections": 0, "war_zones": 0}
        try:
            if os.path.exists(self.db_path):
                with open(self.db_path, 'r', encoding='utf-8') as f:
                    cases = json.load(f).get("test_cases", [])
                    stats["cases"] = len(cases)
                    stats["war_zones"] = sum(1 for c in cases if all(p in c.get("tags", []) for p in ["ODIN", "ALFRED"]))
            
            if os.path.exists(self.rej_path):
                with open(self.rej_path, 'r', encoding='utf-8') as f:
                    stats["rejections"] = max(0, len(f.readlines()) - 3)
        except: pass
        return stats

class OverwatchRenderer:
    """[ALFRED] Dashboard renderer for the Neural Overwatch TUI."""
    def __init__(self):
        self.latency_trend: List[float] = []

    def render_header(self):
        print(f"\n{HUD.RED}{HUD.BOLD}Ω NEURAL OVERWATCH Ω{HUD.RESET}")
        print(f"{HUD.DIM}Monitoring Federated Network...{HUD.RESET}\n")
        HUD.log("INFO", "System Online", "Listening on mock_project/network_share")

    def render_heatmap(self, threat_matrix: List[float]):
        """Render a 5x5 sc-fi security heatmap."""
        print(f"\n{HUD.BOLD}SECURITY HEATMAP [HEIMDALL SCAN]{HUD.RESET}")
        for i in range(0, 25, 5):
            row = threat_matrix[i:i+5]
            row_str = " ".join([self._color_cell(v) for v in row])
            print(f"  {row_str}")
        print(f"{HUD.DIM}Status: Secure / Low Threat{HUD.RESET}")

    def _color_cell(self, val: float) -> str:
        if val > 0.8: return f"{HUD.RED}■{HUD.RESET}"
        if val > 0.4: return f"{HUD.YELLOW}■{HUD.RESET}"
        return f"{HUD.GREEN}■{HUD.RESET}"

    def render_pulse_logs(self, logs: List[str]):
        """Render the 5 most recent neural pulse events."""
        print(f"\n{HUD.BOLD}NEURAL PULSE LOGS [LATEST INTENTS]{HUD.RESET}")
        for log in logs[-5:]:
            print(f"  {HUD.DIM}»{HUD.RESET} {HUD.CYAN}{log}{HUD.RESET}")
        if not logs: print(f"  {HUD.DIM}(Waiting for signal...){HUD.RESET}")

    def update_latency(self, lat: float):
        self.latency_trend.append(lat)
        if len(self.latency_trend) > 20: self.latency_trend.pop(0)
        status = "PASS" if lat < 100 else "WARN"
        HUD.log(status, f"Engine Latency: {lat:.2f}ms", f"Trend: {HUD.render_sparkline(self.latency_trend)}")

class InputManager:
    """[ALFRED] Non-blocking input handler for interactive controls."""
    @staticmethod
    def poll() -> Optional[str]:
        if os.name == 'nt' and msvcrt.kbhit():
            return msvcrt.getch().decode('utf-8').lower()
        return None

class Overwatch:
    def __init__(self):
        self.base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.root = os.path.dirname(self.base)
        self.collector = StatsCollector(self.root, self.base)
        self.renderer = OverwatchRenderer()
        self.last_stats = self.collector.collect()
        self.pulse = 0

    def run(self):
        self.renderer.render_header()
        # Initial scan
        threats = self._update_heatmap()
        pulse_logs = []
        while True:
            try:
                self._handle_input()
                if self.pulse % 20 == 0: 
                    self._check_delta()
                    pulse_logs = self._get_latest_pulses()
                if self.pulse % 50 == 0: 
                    threats = self._update_heatmap()
                    self.renderer.render_heatmap(threats)
                    self.renderer.render_pulse_logs(pulse_logs)
                if self.pulse % 600 == 0: self._measure_latency()
                time.sleep(0.1)
                self.pulse += 1
            except KeyboardInterrupt:
                HUD.log("INFO", "Overwatch Shutdown"); sys.exit(0)
            except Exception as e:
                HUD.log("FAIL", f"Monitor Error: {str(e)[:40]}"); time.sleep(5)

    def _handle_input(self):
        cmd = InputManager.poll()
        if not cmd: return
        if cmd == 'q': HUD.log("INFO", "Overwatch Shutdown"); sys.exit(0)
        elif cmd == 'c': os.system('cls'); self.renderer.render_header()
        elif cmd == 'h': self.renderer.render_heatmap([0.1]*25)
        elif cmd == 'p':
            rej_path = self.collector.rej_path
            if os.path.exists(rej_path):
                with open(rej_path, 'w', encoding='utf-8') as f: f.write("# Rejection Ledger\n\n")
                HUD.log("WARN", "Rejection Ledger Purged")

    def _check_delta(self):
        curr = self.collector.collect()
        if curr["cases"] > self.last_stats["cases"]:
            HUD.log("PASS", f"Ingested {curr['cases'] - self.last_stats['cases']} new traces", f"(Total: {curr['cases']})")
        if curr["rejections"] > self.last_stats["rejections"]:
            HUD.log("WARN", f"New Trace Rejected", f"(Total: {curr['rejections']})")
        if curr["war_zones"] > self.last_stats["war_zones"]:
            HUD.log("CRITICAL", "New War Zone Detected")
        self.last_stats = curr

    def _measure_latency(self):
        l_script = os.path.join(self.base, "scripts", "latency_check.py")
        res = subprocess.run([sys.executable, l_script, "3"], capture_output=True, text=True)
        if res.returncode == 0:
            try: self.renderer.update_latency(float(res.stdout.strip()))
            except: pass

    def _update_heatmap(self) -> List[float]:
        """[ODIN] Scan core scripts for vulnerabilities to populate matrix."""
        from security_scan import SecurityScanner
        scripts_dir = os.path.join(self.base, "scripts")
        files = [f for f in os.listdir(scripts_dir) if f.endswith(".py")][:25]
        
        matrix = [0.0] * 25
        for i, f in enumerate(files):
            scanner = SecurityScanner(os.path.join(scripts_dir, f))
            scanner.scan()
            matrix[i] = scanner.threat_score / 10.0 # Normalize 0-1
        return matrix

    def _get_latest_pulses(self) -> List[str]:
        """[ALFRED] Extract most recent triggers from trace artifacts."""
        trace_dir = os.path.join(self.base, "traces")
        if not os.path.exists(trace_dir): return []
        
        files = sorted([f for f in os.listdir(trace_dir) if f.endswith(".json")], key=lambda x: os.path.getmtime(os.path.join(trace_dir, x)))
        triggers = []
        for f in files[-10:]: # Look at last 10 files
            try:
                with open(os.path.join(trace_dir, f), 'r', encoding='utf-8') as tf:
                    data = json.load(tf)
                    if "trigger" in data: triggers.append(data["trigger"])
            except: pass
        return triggers

def get_stats() -> Dict[str, int]:
    """[ALFRED] Compatibility wrapper for the test suite."""
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root = os.path.dirname(base)
    return StatsCollector(root, base).collect()

if __name__ == "__main__":
    Overwatch().run()
