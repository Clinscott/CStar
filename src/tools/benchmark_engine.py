import statistics
import subprocess
import sys
import time
from pathlib import Path

# Add script directory to path for module discovery
current_dir = Path(__file__).parent.resolve()
project_root = current_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.report_engine import ReportEngine


def benchmark(n=100) -> None:
    """
    Executes a performance trial of the sv_engine.py startup latency.

    Args:
        n: The number of trials to execute for statistical significance.
    """
    cmd = ["python", ".agent/scripts/sv_engine.py", "--benchmark"]
    times = []

    print(f"Executing {n} trials of sv_engine.py startup...")

    for i in range(n):
        start = time.perf_counter()
        subprocess.run(cmd, capture_output=True, check=True)
        end = time.perf_counter()
        times.append((end - start) * 1000) # ms

        if (i+1) % 10 == 0:
            print(f"Completed {i+1}/{n} trials...")

    min_t = min(times)
    max_t = max(times)
    avg_t = statistics.mean(times)
    stdev = statistics.stdev(times)

    engine = ReportEngine()

    body = f"""
| Metric | Result |
| :--- | :--- |
| **Trials** | {n} |
| **Min Time** | {min_t:.2f} ms |
| **Max Time** | {max_t:.2f} ms |
| **Avg Time** | {avg_t:.2f} ms |
| **Std Dev** | {stdev:.2f} ms |
"""

    if avg_t < 100:
        verdict = "HIGHLY VIABLE"
        detail = "System operating at peak efficiency."
    elif avg_t < 500:
        verdict = "VIABLE"
        detail = "Standard operation."
    else:
        verdict = "WARNING"
        detail = "Performance optimization recommended."

    body += engine.verdict(verdict, detail)
    print(engine.generate_report("CORVUS STAR PERFORMANCE REPORT", body))

if __name__ == "__main__":
    benchmark()
