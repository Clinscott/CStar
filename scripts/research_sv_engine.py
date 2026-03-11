import time
import sys
import os
from pathlib import Path

# [🔱] THE GROUND TRUTH: Fixed data for the research loop
QUERIES = [
    "How do I start the ravens?",
    "What is the sterling mandate?",
    "Show me the path to the hall of records",
    "How does the one mind work?",
    "Execute a scan of the src directory"
]

def benchmark():
    # [ALFRED] Absolute pathing for reliable import
    PROJECT_ROOT = Path(__file__).resolve().parent.parent
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
        
    from src.core.sv_engine import SovereignEngine
    
    # Initialize the Engine
    # Note: SovereignEngine handles its own bootstrap internally
    engine = SovereignEngine(project_root=PROJECT_ROOT)
    
    # 1. Warmup
    for q in QUERIES[:2]:
        engine.run(query=q, json_mode=True)
        
    # 2. Benchmark Latency
    start = time.time()
    iterations = 20 # Reduced for faster baseline
    for _ in range(iterations):
        for q in QUERIES:
            engine.run(query=q, json_mode=True)
    
    end = time.time()
    avg_latency = (end - start) / (iterations * len(QUERIES))
    
    # [Ω] THE OUTPUT: The Crucible Controller expects this format
    print(f"METRIC: {avg_latency:.6f}")
    print(f"Latency: {avg_latency*1000:.3f}ms per query")
    
    engine.teardown()

if __name__ == "__main__":
    try:
        benchmark()
    except Exception as e:
        import traceback
        print(f"Benchmark Failed: {e}")
        traceback.print_exc()
        sys.exit(1)
