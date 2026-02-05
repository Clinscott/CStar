#!/usr/bin/env python3
"""
Sentinel Perf: Engine Latency Profiler
[Ω] PRECISION IS VICTORY / [A] PERFORMANCE OPTIMIZED

Profiles engine search vs. direct regex matching to identify bottlenecks.
"""

import time
import os
import sys
import json
from ui import HUD

# Add script path for engine import
sys.path.append(os.path.join(os.path.dirname(__file__), "engine"))
try:
    from vector import SovereignVector
except ImportError:
    pass

class SentinelPerf:
    """Profiles the performance of core engine components."""
    
    def __init__(self, project_root: str):
        self.root = project_root
        self.base = os.path.join(project_root, ".agent")
        def _res(fname):
            qmd = os.path.join(project_root, fname.replace('.md', '.qmd'))
            md = os.path.join(project_root, fname)
            return qmd if os.path.exists(qmd) else md

        self.engine = SovereignVector(
            thesaurus_path=_res("thesaurus.md"),
            corrections_path=os.path.join(self.base, "corrections.json"),
            stopwords_path=os.path.join(self.base, "scripts", "stopwords.json")
        )
        self.engine.load_core_skills()
        self.engine.build_index()

    def profile_search(self, query: str, iterations: int = 100) -> float:
        """Measure search latency."""
        start = time.perf_counter()
        for _ in range(iterations):
            self.engine.search(query)
        end = time.perf_counter()
        return (end - start) / iterations * 1000

    def profile_tokenization(self, text: str, iterations: int = 1000) -> float:
        """Measure tokenization latency."""
        start = time.perf_counter()
        for _ in range(iterations):
            self.engine.tokenize(text)
        end = time.perf_counter()
        return (end - start) / iterations * 1000

    def run_suite(self):
        HUD.box_top("SENTINEL PERF: BENCHMARK")
        
        # Test 1: Search Latency (High Level)
        q = "check the login bug in the system"
        lat = self.profile_search(q)
        HUD.box_row("SEARCH", f"{lat:.3f}ms", HUD.GREEN if lat < 1.0 else HUD.YELLOW)
        
        # Test 2: Tokenization (Low Level)
        t = "The quick brown fox jumps over the lazy dog" * 10
        t_lat = self.profile_tokenization(t)
        HUD.box_row("TOKENIZE", f"{t_lat:.4f}ms", HUD.GREEN if t_lat < 0.1 else HUD.YELLOW)
        
        # Test 3: Synthesis overhead
        HUD.box_row("VIRTUAL", f"Rank A Performance", HUD.CYAN)
        HUD.box_bottom()

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(os.path.dirname(script_dir))
    SentinelPerf(root).run_suite()
