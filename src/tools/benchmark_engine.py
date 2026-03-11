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
from src.core.engine.validation_result import BenchmarkResult, create_benchmark_result

def benchmark(n: int = 100) -> BenchmarkResult:
    return BenchmarkOrchestrator.execute(n)

class BenchmarkOrchestrator:
    """[O.D.I.N.] Orchestration logic for Corvus Star performance benchmarking."""

    @staticmethod
    def execute(n: int = 100) -> BenchmarkResult:
        """
        Executes a performance trial of the sv_engine.py startup latency.

        Args:
            n: The number of trials to execute for statistical significance.
        """
        cmd = ["python", ".agents/scripts/sv_engine.py", "--benchmark"]
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
            benchmark_result = create_benchmark_result(
                status="PASS",
                summary=detail,
                trials=n,
                avg_latency_ms=avg_t,
                min_latency_ms=min_t,
                max_latency_ms=max_t,
                stddev_latency_ms=stdev,
                metadata={"verdict": verdict},
            )
        elif avg_t < 500:
            verdict = "VIABLE"
            detail = "Standard operation."
            benchmark_result = create_benchmark_result(
                status="PASS",
                summary=detail,
                trials=n,
                avg_latency_ms=avg_t,
                min_latency_ms=min_t,
                max_latency_ms=max_t,
                stddev_latency_ms=stdev,
                metadata={"verdict": verdict},
            )
        else:
            verdict = "WARNING"
            detail = "Performance optimization recommended."
            benchmark_result = create_benchmark_result(
                status="FAIL",
                summary=detail,
                trials=n,
                avg_latency_ms=avg_t,
                min_latency_ms=min_t,
                max_latency_ms=max_t,
                stddev_latency_ms=stdev,
                metadata={"verdict": verdict},
            )

        body += engine.verdict(verdict, detail)
        print(engine.generate_report("CORVUS STAR PERFORMANCE REPORT", body))
        return benchmark_result

if __name__ == "__main__":
    BenchmarkOrchestrator.execute()
