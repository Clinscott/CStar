#!/usr/bin/env python3
"""
[ODIN] Latency Profiler (latency_check.py)
Measures Sovereign Engine search and startup performance metrics.
Encapsulated for the Linscott Standard.
"""

import os
import subprocess
import sys
import time
from typing import List


class LatencyProfiler:
    """
    [ODIN] Handles performance measurement for the Sovereign Engine.
    Focuses on cold-start latency and search execution timing.
    """

    def __init__(self, iterations: int = 5) -> None:
        self.iterations = iterations
        self.scripts_dir = os.path.dirname(os.path.abspath(__file__))
        self.agent_dir = os.path.dirname(self.scripts_dir)
        self.project_root = os.path.dirname(self.agent_dir)
        self.engine_path = os.path.join(self.scripts_dir, "sv_engine.py")

    def measure_startup(self) -> float:
        """
        Runs the engine multiple times to calculate average latency.
        
        Returns:
            Average startup latency in milliseconds.
        """
        cmd = [sys.executable, self.engine_path, "--json", "ping"]
        latencies: List[float] = []
        
        for _ in range(self.iterations):
            try:
                start = time.perf_counter()
                subprocess.run(
                    cmd, 
                    capture_output=True, 
                    cwd=self.project_root, 
                    timeout=10,
                    check=False
                )
                end = time.perf_counter()
                latencies.append((end - start) * 1000)
            except (subprocess.SubprocessError, subprocess.TimeoutExpired):
                # Penalty for failed execution
                latencies.append(10000.0)
            
        if not latencies:
            return 10000.0
            
        return sum(latencies) / len(latencies)

    def measure_search(self, query: str = "check logs") -> float:
        """
        Measures the raw search latency of the engine.
        
        Returns:
            Average search latency in milliseconds.
        """
        cmd = [sys.executable, self.engine_path, "--json", query]
        latencies: List[float] = []
        
        for _ in range(self.iterations):
            try:
                start = time.perf_counter()
                subprocess.run(
                    cmd, 
                    capture_output=True, 
                    cwd=self.project_root, 
                    timeout=5,
                    check=False
                )
                end = time.perf_counter()
                latencies.append((end - start) * 1000)
            except (subprocess.SubprocessError, subprocess.TimeoutExpired):
                latencies.append(5000.0)
                
        return sum(latencies) / len(latencies) if latencies else 5000.0


def main() -> None:
    """Entry point for command line profiling."""
    iterations = 5
    if len(sys.argv) > 1:
        try:
            iterations = int(sys.argv[1])
        except ValueError:
            pass
            
    profiler = LatencyProfiler(iterations=iterations)
    avg_startup = profiler.measure_startup()
    avg_search = profiler.measure_search()
    
    # [ALFRED] Return as CSV: Startup,Search
    print(f"{avg_startup:.2f},{avg_search:.2f}")


if __name__ == "__main__":
    main()