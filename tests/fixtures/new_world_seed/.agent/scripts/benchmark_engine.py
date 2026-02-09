import time
import subprocess
import statistics
import os
import sys

def benchmark(n=100):
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

    print("\n" + "="*40)
    print("       CORVUS STAR PERFORMANCE REPORT")
    print("="*40)
    print(f"Trials:      {n}")
    print(f"Min Time:    {min_t:.2f} ms")
    print(f"Max Time:    {max_t:.2f} ms")
    print(f"Avg Time:    {avg_t:.2f} ms")
    print(f"Std Dev:     {stdev:.2f} ms")
    print("="*40)
    
    if avg_t < 500:
        print("RESULT: CLI ARCHITECTURE IS HIGHLY VIABLE.")
    else:
        print("RESULT: PERFORMANCE OPTIMIZATION RECOMMENDED.")

if __name__ == "__main__":
    benchmark()
