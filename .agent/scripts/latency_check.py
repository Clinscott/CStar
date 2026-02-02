import time
import subprocess
import os
import sys
import json

# Ensure we are in the right directory context
scripts_dir = os.path.dirname(os.path.abspath(__file__))
agent_dir = os.path.dirname(scripts_dir)
project_root = os.path.dirname(agent_dir)

def measure_startup(iterations: int = 10) -> float:
    """
    Measures the startup latency of the Corvus Star engine.
    
    Args:
        iterations: Number of runs to average.
        
    Returns:
        Average latency in milliseconds.
    """
    cmd = ["python", os.path.join(scripts_dir, "sv_engine.py"), "--json", "ping"]
    times = []
    
    for _ in range(iterations):
        start = time.perf_counter()
        subprocess.run(cmd, capture_output=True, cwd=project_root)
        end = time.perf_counter()
        times.append((end - start) * 1000) # ms
        
    avg = sum(times) / len(times)
    return avg

if __name__ == "__main__":
    iterations = 5
    if len(sys.argv) > 1:
        try:
            iterations = int(sys.argv[1])
        except: pass
        
    avg_latency = measure_startup(iterations)
    print(f"{avg_latency:.2f}")
