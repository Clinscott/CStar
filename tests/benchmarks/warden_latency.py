import time
import numpy as np
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT))

try:
    from src.core.engine.atomic_gpt import AnomalyWarden
except ImportError:
    print("FAIL: Could not import AnomalyWarden. Ensure PYTHONPATH is set correctly.")
    sys.exit(1)

def run_benchmark():
    print("┌──────────────────────────────────────────────────────────────────────────────┐")
    print("│  🔱 ANOMALY WARDEN INFERENCE BENCHMARK                                        │")
    print("└──────────────────────────────────────────────────────────────────────────────┘")
    
    warden = AnomalyWarden()
    
    # Warm up running stats
    for _ in range(50):
        mock_features = [
            np.random.normal(500, 100), # latency
            np.random.randint(10, 100), # tokens
            1.0,                       # loops
            0.0                        # error
        ]
        warden._update_stats(np.array(mock_features))

    iterations = 1000
    times = []
    
    for _ in range(iterations):
        test_features = [
            np.random.normal(500, 100),
            np.random.randint(10, 100),
            1.0,
            0.0
        ]
        
        start = time.perf_counter()
        warden.forward(test_features)
        end = time.perf_counter()
        
        times.append((end - start) * 1000) # ms

    avg_latency = np.mean(times)
    p95_latency = np.percentile(times, 95)
    max_latency = np.max(times)

    print(f"| Metric | Value |")
    print(f"| :--- | :--- |")
    print(f"| **Iterations** | {iterations} |")
    print(f"| **Average Latency** | {avg_latency:.4f}ms |")
    print(f"| **P95 Latency** | {p95_latency:.4f}ms |")
    print(f"| **Max Latency** | {max_latency:.4f}ms |")
    print(f"└──────────────────────────────────────────────────────────────────────────────┘")

    if avg_latency < 1.0:
        print("✅ PASS: Inference latency is < 1ms.")
    else:
        print("❌ FAIL: Inference latency exceeds 1ms.")

if __name__ == "__main__":
    run_benchmark()
