import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[4]
RESEARCH_DIR = PROJECT_ROOT / ".agents" / "skills" / "research"
LEDGER_PATH = RESEARCH_DIR / "research_ledger.json"

class CrucibleController:
    def __init__(self, target: str, budget: int = 300, eval_cmd: str = None):
        RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
        self.target = Path(target)
        self.budget = budget
        self.eval_cmd = eval_cmd or f"python {self.target}"
        self.ledger = self._load_ledger()

    def _load_ledger(self):
        if LEDGER_PATH.exists():
            return json.loads(LEDGER_PATH.read_text())
        return {"experiments": [], "global_best": None}

    def _save_ledger(self):
        LEDGER_PATH.write_text(json.dumps(self.ledger, indent=2))

    def run_experiment(self, hypothesis: str = "Unnamed Experiment"):
        print(f"◤ INITIATING CRUCIBLE: {self.target.name} ◢")
        print(f"  ◈ Budget: {self.budget}s")
        print(f"  ◈ Hypothesis: {hypothesis}")

        start_time = time.time()
        try:
            # Run the target with a fixed timeout (The Crucible)
            result = subprocess.run(
                self.eval_cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=self.budget,
                cwd=PROJECT_ROOT,
                env={**os.environ, "PYTHONPATH": str(PROJECT_ROOT)}
            )
            
            output = result.stdout + result.stderr
            metric = self._parse_metric(output)
            status = "SUCCESS" if result.returncode == 0 else "FAILED"

        except subprocess.TimeoutExpired:
            print("  ◈ [WARNING] Crucible Timeout Reached. Capturing partial state...")
            status = "TIMEOUT"
            metric = None
        except Exception as e:
            print(f"  ◈ [ERROR] Experiment crashed: {e}")
            status = "ERROR"
            metric = None

        duration = time.time() - start_time
        experiment = {
            "timestamp": time.time(),
            "target": str(self.target),
            "hypothesis": hypothesis,
            "status": status,
            "duration": round(duration, 2),
            "metric": metric
        }

        self.ledger["experiments"].append(experiment)
        self._update_global_best(experiment)
        self._save_ledger()

        print(f"  ◈ Status: {status}")
        if status == "FAILED" or status == "ERROR":
            print(f"  ◈ [LOG] {output}")
        print(f"  ◈ Metric: {metric if metric else 'N/A'}")
        print(f"  ◈ Duration: {experiment['duration']}s")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    def _parse_metric(self, output: str):
        # [🔱] THE SENSORS: Attempt to find a metric in the output
        # Looks for "metric: 0.123" or "val_loss: 0.123"
        import re
        patterns = [
            r"metric[:=]\s*([\d\.]+)",
            r"val_loss[:=]\s*([\d\.]+)",
            r"accuracy[:=]\s*([\d\.]+)",
            r"score[:=]\s*([\d\.]+)"
        ]
        for p in patterns:
            match = re.search(p, output, re.IGNORECASE)
            if match:
                return float(match.group(1))
        return None

    def _update_global_best(self, experiment):
        if experiment["status"] != "SUCCESS" or experiment["metric"] is None:
            return
            
        current_best = self.ledger.get("global_best")
        if not current_best or experiment["metric"] < current_best["metric"]:
            print(f"  ◈ [NEW RECORD] Global Best: {experiment['metric']}")
            self.ledger["global_best"] = experiment

def main():
    parser = argparse.ArgumentParser(description="Corvus Research Crucible")
    parser.add_argument("target", help="The file to experiment on")
    parser.add_argument("--budget", type=int, default=300, help="Fixed time budget (seconds)")
    parser.add_argument("--eval", help="Custom evaluation command")
    parser.add_argument("--hypothesis", default="Dynamic optimization strike", help="Description of the test")
    
    args = parser.parse_args()
    
    crucible = CrucibleController(args.target, args.budget, args.eval)
    crucible.run_experiment(args.hypothesis)

if __name__ == "__main__":
    main()
