#!/usr/bin/env python3
"""
[DEBUG] Performance Profiler
Lore: "Measuring the velocity of the ravens' flight."
Purpose: Profiles the SovereignVector engine initialization and search latency.
"""

import time
from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
import sys
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.core.engine.vector import SovereignVector

def run_profile() -> None:
    return PerformanceProfiler.execute()

class PerformanceProfiler:
    """[O.D.I.N.] Orchestration logic for neural engine performance profiling."""

    @staticmethod
    def execute() -> None:
        """
        Executes a performance profile of the SovereignVector engine.
        Measures initialization time, uncached search latency, and cached search latency.
        """
        print("Initializing Engine...")
        t0 = time.time()
        engine = SovereignVector(
            thesaurus_path=str(PROJECT_ROOT / "thesaurus.qmd"),
            corrections_path=str(PROJECT_ROOT / ".agent" / "corrections.json"),
            stopwords_path=str(PROJECT_ROOT / "src" / "data" / "stopwords.json")
        )
        engine.load_core_skills()
        engine.load_skills_from_dir(str(PROJECT_ROOT / ".agent" / "skills"))
        engine.build_index()
        t1 = time.time()
        print(f"Init Time: {(t1-t0)*1000:.2f} ms")

        print(f"Vocab Size: {len(engine.vocab)}")
        print(f"Skills Count: {len(engine.skills)}")
        print(f"Vectors Count: {len(engine.vectors)}")

        # Test Uncached
        print("\n--- Uncached Search Test (100 unique queries) ---")
        queries = [f"unique query test {i}" for i in range(100)]
        t_start = time.perf_counter()
        for q in queries:
            engine.search(q)
        t_end = time.perf_counter()
        avg_uncached = ((t_end - t_start) / 100) * 1000
        print(f"Avg Uncached Latency: {avg_uncached:.4f} ms")

        # Test Cached
        print("\n--- Cached Search Test (1000 repeats) ---")
        query = "test cached query"
        engine.search(query) # Warmup
        t_start = time.perf_counter()
        for _ in range(1000):
            engine.search(query)
        t_end = time.perf_counter()
        avg_cached = ((t_end - t_start) / 1000) * 1000
        print(f"Avg Cached Latency: {avg_cached:.4f} ms")

if __name__ == "__main__":
    PerformanceProfiler.execute()
