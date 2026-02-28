import json

try:
    import msvcrt
except ImportError:
    msvcrt = None
import os
import subprocess
import sys
import time

# Resolve shared UI from src/core/
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core"))
import contextlib

from src.core.sovereign_hud import SovereignHUD


class StatsCollector:
    """[ALFRED] Secure statistics accumulator for federated monitoring."""
    def __init__(self, project_root: str, base_dir: str) -> None:
        self.root = project_root
        self.base = base_dir
        self.db_path = os.path.join(project_root, "fishtest_data.json")
        self.rej_path = os.path.join(base_dir, "traces", "quarantine", "REJECTIONS.qmd")

    def collect(self) -> dict[str, int]:
        stats = {"cases": 0, "rejections": 0, "war_zones": 0}
        try:
            if os.path.exists(self.db_path):
                with open(self.db_path, encoding='utf-8') as f:
                    cases = json.load(f).get("test_cases", [])
                    stats["cases"] = len(cases)
                    stats["war_zones"] = sum(1 for c in cases if all(p in c.get("tags", []) for p in ["ODIN", "ALFRED"]))

            if os.path.exists(self.rej_path):
                with open(self.rej_path, encoding='utf-8') as f:
                    stats["rejections"] = max(0, len(f.readlines()) - 3)
        except (json.JSONDecodeError, OSError): pass
        return stats

class OverwatchRenderer:
    """[ALFRED] Dashboard renderer for the Neural Overwatch TUI."""
    def __init__(self) -> None:
        self.latency_trend: list[float] = []

    def render_header(self) -> None:
        print(f"\n{SovereignHUD.RED}{SovereignHUD.BOLD}Ω NEURAL OVERWATCH Ω{SovereignHUD.RESET}")
        print(f"{SovereignHUD.DIM}Monitoring Federated Network...{SovereignHUD.RESET}\n")
        SovereignHUD.log("INFO", "System Online", "Listening on mock_project/network_share")

    def render_heatmap(self, threat_matrix: list[float]) -> None:
        """Render a 5x5 sc-fi security heatmap."""
        print(f"\n{SovereignHUD.BOLD}SECURITY HEATMAP [HEIMDALL SCAN]{SovereignHUD.RESET}")
        for i in range(0, 25, 5):
            row = threat_matrix[i:i+5]
            row_str = " ".join([self._color_cell(v) for v in row])
            print(f"  {row_str}")
        print(f"{SovereignHUD.DIM}Status: Secure / Low Threat{SovereignHUD.RESET}")

    def _color_cell(self, val: float) -> str:
        if val > 0.8: return f"{SovereignHUD.RED}■{SovereignHUD.RESET}"
        if val > 0.4: return f"{SovereignHUD.YELLOW}■{SovereignHUD.RESET}"
        return f"{SovereignHUD.GREEN}■{SovereignHUD.RESET}"

    def render_pulse_logs(self, logs: list[str]) -> None:
        """Render the 5 most recent neural pulse events."""
        print(f"\n{SovereignHUD.BOLD}NEURAL PULSE LOGS [LATEST INTENTS]{SovereignHUD.RESET}")
        for log in logs[-5:]:
            print(f"  {SovereignHUD.DIM}»{SovereignHUD.RESET} {SovereignHUD.CYAN}{log}{SovereignHUD.RESET}")
        if not logs: print(f"  {SovereignHUD.DIM}(Waiting for signal...){SovereignHUD.RESET}")

    def update_latency(self, lat: float) -> None:
        self.latency_trend.append(lat)
        if len(self.latency_trend) > 20: self.latency_trend.pop(0)
        status = "PASS" if lat < 100 else "WARN"
        SovereignHUD.log(status, f"Engine Latency: {lat:.2f}ms", f"Trend: {SovereignHUD.render_sparkline(self.latency_trend)}")

class InputManager:
    """[ALFRED] Non-blocking input handler for interactive controls."""
    @staticmethod
    def poll() -> str | None:
        if os.name == 'nt' and msvcrt and msvcrt.kbhit():
            return msvcrt.getch().decode('utf-8').lower()
        return None

class Overwatch:
    def __init__(self) -> None:
        self.base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.root = os.path.dirname(self.base)
        self.collector = StatsCollector(self.root, self.base)
        self.renderer = OverwatchRenderer()
        self.last_stats = self.collector.collect()
        self.pulse = 0

    def run(self) -> None:
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
                SovereignHUD.log("INFO", "Overwatch Shutdown"); sys.exit(0)
            except Exception as e:
                SovereignHUD.log("FAIL", f"Monitor Error: {str(e)[:40]}"); time.sleep(5)

    def _handle_input(self) -> None:
        cmd = InputManager.poll()
        if not cmd: return
        if cmd == 'q': SovereignHUD.log("INFO", "Overwatch Shutdown"); sys.exit(0)
        elif cmd == 'c': os.system('cls'); self.renderer.render_header()
        elif cmd == 'h': self.renderer.render_heatmap([0.1]*25)
        elif cmd == 'p':
            rej_path = self.collector.rej_path
            if os.path.exists(rej_path):
                with open(rej_path, 'w', encoding='utf-8') as f: f.write("# Rejection Ledger\n\n")
                SovereignHUD.log("WARN", "Rejection Ledger Purged")

    def _check_delta(self) -> None:
        curr = self.collector.collect()
        if curr["cases"] > self.last_stats["cases"]:
            SovereignHUD.log("PASS", f"Ingested {curr['cases'] - self.last_stats['cases']} new traces", f"(Total: {curr['cases']})")
        if curr["rejections"] > self.last_stats["rejections"]:
            SovereignHUD.log("WARN", "New Trace Rejected", f"(Total: {curr['rejections']})")
        if curr["war_zones"] > self.last_stats["war_zones"]:
            SovereignHUD.log("CRITICAL", "New War Zone Detected")
        self.last_stats = curr

    def _measure_latency(self) -> None:
        l_script = os.path.join(self.base, "scripts", "latency_check.py")
        res = subprocess.run([sys.executable, l_script, "3"], capture_output=True, text=True)
        if res.returncode == 0:
            with contextlib.suppress(ValueError, TypeError): self.renderer.update_latency(float(res.stdout.strip()))

    def _update_heatmap(self) -> list[float]:
        """[O.D.I.N.] Scan core scripts for vulnerabilities to populate matrix."""
        from security_scan import SecurityScanner
        scripts_dir = os.path.join(self.base, "scripts")
        files = [f for f in os.listdir(scripts_dir) if f.endswith(".py")][:25]

        matrix = [0.0] * 25
        for i, f in enumerate(files):
            scanner = SecurityScanner(os.path.join(scripts_dir, f))
            scanner.scan()
            matrix[i] = scanner.threat_score / 10.0 # Normalize 0-1
        return matrix

    def _get_latest_pulses(self) -> list[str]:
        """[ALFRED] Extract most recent triggers from trace artifacts."""
        trace_dir = os.path.join(self.base, "traces")
        if not os.path.exists(trace_dir): return []

        files = sorted([f for f in os.listdir(trace_dir) if f.endswith(".json")], key=lambda x: os.path.getmtime(os.path.join(trace_dir, x)))
        triggers = []
        for f in files[-10:]: # Look at last 10 files
            try:
                with open(os.path.join(trace_dir, f), encoding='utf-8') as tf:
                    data = json.load(tf)
                    if "trigger" in data: triggers.append(data["trigger"])
            except (json.JSONDecodeError, OSError): pass
        return triggers

def get_stats() -> dict[str, int]:
    """[ALFRED] Compatibility wrapper for the test suite."""
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root = os.path.dirname(base)
    return StatsCollector(root, base).collect()

if __name__ == "__main__":
    Overwatch().run()
